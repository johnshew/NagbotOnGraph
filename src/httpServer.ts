import { OpenTypeExtension, OutlookTask } from '@microsoft/microsoft-graph-types-beta';
import * as http from 'http';
import * as https from 'https';
import * as jaeger from 'jaeger-tracer-restify';
import { jaegerTracer } from './jaeger'

import { FORMAT_HTTP_HEADERS, Tags } from 'opentracing';
import * as restify from 'restify';
import { htmlPageFromList, htmlPageFromObject, htmlPageMessage } from './htmlTemplates';
import { app, AppConfig } from './nagbotApp';
import { notifyUser } from './notifications';
import { addMetricsAPI, addResponseMetrics, RequestCounters } from './prometheus';
import { User } from './users';
import { logger } from './utils';

const tracer = jaegerTracer;
const requestOriginal = { http: http.request, https: https.request };

export class Server {
    public server: restify.Server;

    constructor(port: string, requestListener?: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
        this.server = restify.createServer({ maxParamLength: 1000 } as restify.ServerOptions);
        configureServer(this.server);
        this.server.listen(port, () => {
            console.log(logger`${this.server.name} listening to ${this.server.url}`);
        });
    }

    public async asyncClose(callback?: () => void): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.server.close(() => {
                console.log('Closed httpServer');
                if (callback) { callback(); }
                return resolve();
            });
        });
    }

    public taskEditUrl(taskId: string) { return `${AppConfig.publicServer.href}task/${taskId}`; }  // was encodeURIComponent(taskId)}`; }
    public taskCompleteUrl(taskId: string) { return `${AppConfig.publicServer.href}task/${encodeURIComponent(taskId)}/complete`; }
}

function configureServer(httpServer: restify.Server) {

    httpServer.pre((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'X-Requested-With');
        return next();
    });

    httpServer.use(restify.plugins.bodyParser());
    httpServer.use(restify.plugins.queryParser());

    httpServer.use((req, res, next) => {
        jaeger.getContext().run(() => {
            console.log(logger`Request for ${req.url} `);
            jaeger.getContext().set('tracer', tracer);
            const parentSpanContext = tracer.extract(FORMAT_HTTP_HEADERS, req.headers);
            const span = jaeger.startSpan(req.path(), parentSpanContext, tracer);
            span.setTag(Tags.HTTP_URL, req.path());
            span.setTag(Tags.HTTP_METHOD, req.method);
            span.setTag('Hostname', req.headers.host);
            span.log({
                event: 'request',
                body: req.body,
                params: req.params,
                query: req.query,
                headers: req.headers,
            });
            let responseSpanLogEntry: any = { event: 'response' };
            res.once('error', (response: restify.Response, err: Error) => {
                console.log(logger`response error`);
                span.log({
                    event: 'response',
                    status: 'error',
                    error: err,
                    headers: response && response.getHeaders ? response.getHeaders() : {}, // work with both express ???
                    statusCode: response && response.statusCode || 'no status found',
                });
                span.finish();
                console.log(logger`res error span finished`);

            });
            res.once('finish', (response: restify.Response) => {
                span.log({
                    ...responseSpanLogEntry,
                    headers: response && response.getHeaders ? response.getHeaders() : {},
                    statusCode: response && response.statusCode || 'no status code found',
                    statusMessage: response && response.statusMessage || 'no message found',
                    // json_hook below will pick up the body.
                });
                span.finish();
                console.log(logger`response finish span finished`);

            });
            jaeger.getContext().bindEmitter(req);
            jaeger.getContext().bindEmitter(res);
            jaeger.getContext().set('main-span', span);
            jaeger.getContext().run(() => {
                // hook response.json to capture body
                const jsonFunctionOnResponseObject = res.json;

                function json_hook(...args: any[])
                //!TODO this assumes one argument - is restify this can be 3 args long
                {
                    const json = (args.length < 2) ? args[0] : args[1];
                    console.log(logger`intercept json hook called`);
                    const originalJsonValue = json;
                    res.json = jsonFunctionOnResponseObject;
                    if (res.headersSent) {
                        console.log(logger`headers have been sent`);
                        return originalJsonValue;
                    }
                    try {
                        responseSpanLogEntry = {
                            ...responseSpanLogEntry,
                            status: 'normal',
                            body: '<response json called>',
                        };
                        console.log(logger`responseSpanLogEntry`, responseSpanLogEntry);
                    } catch (e) {
                        return originalJsonValue;
                    }

                    // If no returned value from fn, then assume json has been mucked with.
                    if (json === undefined || json === null) {
                        return originalJsonValue;
                    }
                    console.log(logger`calling actual response.json`);
                    return jsonFunctionOnResponseObject.call(this, ...args);
                }

                res.json = json_hook;

                // !TODO: need to hook http, https
                function wrappedHttpRequest(...args: any[]): http.ClientRequest {
                    console.log(logger`wrapped http request`);
                    if (args.length < 1) throw new Error('wrapped http.request requires 1 or more args');
                    let headers: any = {};
                    tracer.inject(span, FORMAT_HTTP_HEADERS, headers);
                    if (args[0] && args[0]['headers']) {
                        args[0]['headers'] = { ...args[0]['headers'] || {}, ...headers || {} };
                    }
                    let foo: any = args;
                    return requestOriginal.http(args[0], args[1], args[2]);
                }
                (http as any).request = wrappedHttpRequest;
                next();
            });
        });
    });

    httpServer.use(RequestCounters);
    addResponseMetrics(httpServer);
    addMetricsAPI(httpServer);

    //// Static pages

    httpServer.get('/', (req, res, next) => { res.redirect('./public/app.html', next); });
    httpServer.get('/public/app.html*', restify.plugins.serveStatic({ directory: __dirname + '/../public', file: 'app.html' }));
    httpServer.get('/public/*', restify.plugins.serveStatic({ directory: __dirname + '/..' }));

    //// Authentication logic for Web

    httpServer.get('/login', (req, res, next) => {
        const host = req.headers.host;
        const protocol = host.toLowerCase().includes('localhost') || host.includes('127.0.0.1') ? 'http://' : 'https://';
        const authUrl = app.authManager.authUrl({ redirect: new URL(AppConfig.authPath, protocol + host).href, state: protocol + host });
        console.log(logger`redirecting to ${authUrl} `);
        res.redirect(authUrl, next);
    });

    httpServer.get('/auth', async (req, res, next) => {
        try {
            // look for authorization code coming in (indicates redirect from interative login/consent)
            const code = req.query.code;
            if (code) {
                const host = req.headers.host;
                const protocol = host.toLowerCase().includes('localhost') || host.includes('127.0.0.1') ? 'http://' : 'https://';
                const authContext = await app.authManager.newContextFromCode(code, protocol + host + '/auth');
                const profile = await app.graph.getProfile(await app.authManager.getAccessToken(authContext));
                const user: User = { oid: authContext.oid, authKey: authContext.authKey, authTokens: authContext };
                if (profile.preferredName) { user.preferredName = profile.preferredName; }
                if (profile.mail) { user.email = profile.mail; }
                await app.users.set(authContext.oid, user);
                res.header('Set-Cookie', 'userId=' + authContext.authKey + '; expires=' + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString());
                const stateString: string = req.query.state;
                let state: any = {};
                try { state = JSON.parse(stateString); } catch (e) {
                    console.log(logger`bad state string`);
                }
                if (!state.url) { state.url = '/'; }
                if (state.key) {
                    // should send verification code to user via web and wait for it on the bot.
                    // ignore for now.
                    const conversation = await app.conversationManager.setOidForUnauthenticatedConversation(state.key, authContext.oid);
                    await app.botService.processActivityInConversation(conversation, async (turnContext) => {
                        return await turnContext.sendActivity('Connected.');
                    });
                } // else no state.key so it is a plain web login
                res.redirect(state.url, next);
                return;
            }
        } catch (reason) {
            console.log('Error in /auth processing: ' + reason);
        }
        res.setHeader('Content-Type', 'text/html');
        res.end(htmlPageMessage('Error', 'Request to authorize failed', '<br/><a href="/">Continue</a>'));
        next();
        return;
    });

    // Authentication logic for bot

    httpServer.get('/bot-login', (req, res, next) => {
        const host = req.headers.host;
        const protocol = host.toLowerCase().includes('localhost') || host.includes('127.0.0.1') ? 'http://' : 'https://';
        const conversationKey = req.query.conversationKey || '';
        const location = req.query.redirectUrl;
        const authUrl = app.authManager.authUrl({
            state: JSON.stringify({
                key: conversationKey,
                redirect: protocol + host + AppConfig.authPath,
                url: location,
            }),

        });
        console.log(logger`redirecting to ${authUrl}`);
        res.redirect(authUrl, next);
    });

    //// Endpoints that are included in notifications

    httpServer.get('/task/:taskId/complete', async (req, res, next) => {
        try {
            //// Ignore OID?  Do fetch and than ask about
            const authContext = await app.authManager.getAuthContextFromAuthKey(getCookie(req, 'userId'));
            if (!authContext || !authContext.oid) {
                console.log('not legged in');
                res.setHeader('Content-Type', 'text/html');
                res.end(htmlPageMessage('Task', 'Not logged in.', '<br/><a href="/">Continue</a>'));
                return next();
            }
            const taskId = req.params.taskId;
            if (!taskId) { throw new Error(('edit-task missing parameters')); }
            const accessToken = await app.authManager.getAccessTokenFromAuthKey(authContext.authKey);
            const body: OutlookTask = { status: 'completed' };

            await app.graph.patch(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks/${taskId}`, body)
                .catch((err) => { throw Error(`Notify/patch failed (${err})`); });
            const data = await app.graph.get(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks/${taskId}?${app.graph.queryExpandNagExtensions}`);
            res.setHeader('Content-Type', 'text/html');
            res.end(htmlPageFromObject('task', '', data, '<br/><a href="/">Continue</a>'));
            return next();
        } catch (err) {
            console.log(`/complete-task failed. (${err})`);
            res.send(404, JSON.stringify(err));
            res.end();
            return next();
        }
    });

    httpServer.get('/task/:taskId', async (req, res, next) => {
        try {
            const authContext = await app.authManager.getAuthContextFromAuthKey(getCookie(req, 'userId'));
            if (!authContext || !authContext.oid) {
                console.log('not logged in');
                res.setHeader('Content-Type', 'text/html');
                res.end(htmlPageMessage('Task', 'Not logged in.', '<br/><a href="/">Continue</a>'));
                return next();
            }
            const taskId = req.params.taskId;
            const accessToken = await app.authManager.getAccessTokenFromAuthKey(authContext.authKey);
            const data = await app.graph.get(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks/${taskId}?${app.graph.queryExpandNagExtensions}`);
            res.setHeader('Content-Type', 'text/html');
            res.end(htmlPageFromObject('task', '', data, '<br/><a href="/">Continue</a>'));
            return next();
        } catch (err) {
            console.log(`GET /task failed. (${err}()`);
            res.setHeader('Content-Type', 'text/html');
            res.end(htmlPageFromObject('Task', 'Error.  Are you logged in', err, '<br/><a href="/">Continue</a>'));
            return next();
        }
    });

    // APIs - no html - just json response

    httpServer.get('/api/v1.0/me', async (req, res, next) => {
        await graphGet(req, res, next, 'https://graph.microsoft.com/v1.0/me');
    });

    httpServer.get('/api/v1.0/me/tasks', async (req, res, next) => {
        await graphGet(req, res, next, `https://graph.microsoft.com/beta/me/outlook/tasks?${app.graph.queryExpandNagExtensions}`);
        // https://graph.microsoft.com/beta/me/outlook/tasks?filter=(dueDateTime/DateTime) gt  '2018-12-04T00:00:00Z'
    });

    httpServer.get('/api/v1.0/me/tasks/:id', async (req, res, next) => {
        const id = req.params.id;
        await graphGet(req, res, next, `https://graph.microsoft.com/beta/me/outlook/tasks/${id}?${app.graph.queryExpandNagExtensions}`);
    });

    httpServer.patch('/api/v1.0/me/tasks/:id', async (req, res, next) => {
        const id = req.params.id;
        const data = req.body;
        await graphPatch(req, res, next, `https://graph.microsoft.com/beta/me/outlook/tasks/${id}?${app.graph.queryExpandNagExtensions}`, data);
    });

    httpServer.get('/api/v1.0/me/connections', async (req, res, next) => {
        let error: any;
        try {
            const accessToken = await app.authManager.getAccessTokenFromAuthKey(getCookie(req, 'userId'));
            const conversations = await app.graph.getConversations(accessToken);
            res.json(200, conversations);
            res.end();
            return next();
        } catch (err) {
            error = err;
        }
        res.status(400);
        res.json({ error });
        res.end();
        return next();
    });

    httpServer.patch('/api/v1.0/me/connections/:id', async (req, res, next) => {
        const id = req.params.id;  // this is ignored for now
        const data = req.body;
        let error: any;
        try {
            const authContext = await app.authManager.getAuthContextFromAuthKey(getCookie(req, 'userId'));
            if (!authContext || !authContext.oid) { throw new Error('/me/connections-PATCH: Could not identify user'); }
            app.conversationManager.upsert(authContext.oid, data);
            res.status(200);
            res.end();
            return next();
        } catch (err) { error = error; }
        res.status(400);
        res.json({ error });
        res.end();
        return next();
    });

    httpServer.del('/api/v1.0/me/connections/:id', async (req, res, next) => {
        const id = req.params.id;  // this is ignored for now
        const data = req.body;
        let error: any;
        try {
            const authContext = await app.authManager.getAuthContextFromAuthKey(getCookie(req, 'userId'));
            if (!authContext || !authContext.oid) { throw new Error('/me/connections-PATCH: Could not identify user'); }
            app.conversationManager.delete(authContext.oid, data);
            res.status(200);
            res.end();
            return next();
        } catch (err) { error = error; }
        res.status(400);
        res.json({ error });
        res.end();
        return next();
    });

    /// Interactive Tests

    httpServer.get('/test-mail', async (req, res, next) => {
        await graphGet(req, res, next, 'https://graph.microsoft.com/beta/me/messages', (data: { value: OutlookTask[] }) => {
            const subjects = data.value.map((tasks) => 'Subject: ' + tasks.subject);
            return htmlPageFromList('Mail', '', subjects, '<a href="/">Continue</a>');
        });
    });

    httpServer.get('/test-tasks', async (req, res, next) => {
        await graphGet(req, res, next, "https://graph.microsoft.com/beta/me/outlook/tasks?filter=(status eq 'notStarted') and (categories/any(a:a+eq+'NagMe'))", (data: { value: OutlookTask[] }) => {
            const subjects = data.value.map((task) => 'Subject: ' + task.subject);
            return htmlPageFromList('Tasks', '', subjects, '<a href="/">Continue</a>');
        });
    });

    httpServer.get('/test-profile', async (req, res, next) => {
        await graphGet(req, res, next, 'https://graph.microsoft.com/beta/me/extensions', (data: any) => {
            return htmlPageFromObject('Profile', '', data, '<a href="/">Continue</a>');
        });
    });

    httpServer.get('/test-update', async (req, res, next) => {
        let responseCode: number | null = null;
        const body: OpenTypeExtension & { time?: string } = { time: new Date().toISOString() };
        try {
            const accessToken = await app.authManager.getAccessTokenFromAuthKey(getCookie(req, 'userId'));
            await app.graph.patch(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger', body);
        } catch (err) {
            console.log(`patch on user extension failed ${err}`);
            responseCode = err;
        }

        if (responseCode === 404) {
            try {
                responseCode = null;
                const accessToken = await app.authManager.getAccessTokenFromAuthKey(getCookie(req, 'userId'));
                body.extensionName = 'net.shew.nagger';
                body.id = 'net.shew.nagger';
                const location = await app.graph.post(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions', body);
            } catch (err) {
                console.log(`post on user extension failed ${err}`);
                responseCode = err;
            }
        }

        res.setHeader('Content-Type', 'text/html');
        if (!responseCode) {
            res.end('<html><head></head><body><p>User updated</p><a href="/">Continue</a></body></html>');
            return next();
        } else {
            res.end('<html><head></head><body>Unable to update user information<br/><a href="/">Continue</a></body></html>');
            return next();
        }
    });

    httpServer.get('/test-notify', async (req, res, next) => {
        const responseCode: number | null = null;
        try {
            const authContext = await app.authManager.getAuthContextFromAuthKey(getCookie(req, 'userId'));
            notifyUser(authContext.oid);
            res.setHeader('Content-Type', 'text/html');
            res.end(htmlPageMessage('Test Notifications', 'Done with notifications', '<br/><a href="/">Continue</a></body></html>'));
            return next();
        } catch (err) {
            console.log(`/test-notify failed ${err}`);
            res.setHeader('Content-Type', 'text/html');
            res.end(htmlPageMessage('Test Notifications', `Test Notifications failed.<\br>Error: ${err}`, '<br/><a href="/">Continue</a></body></html>'));
            return next();
        }
    });

    httpServer.get('/test-patch', async (req, res, next) => {
        const accessToken = await app.authManager.getAccessTokenFromAuthKey(getCookie(req, 'userId'));
        const tasks = await app.graph.get<{ value: OutlookTask[] }>(accessToken,
            `https://graph.microsoft.com/beta/me/outlook/tasks?${app.graph.filterNotCompletedAndNagMeCategory}&${app.graph.queryExpandNagExtensions}`);
        if (tasks && tasks.value && Array.isArray(tasks.value) && tasks.value.length > 0) {
            const task = tasks.value[0];
            const id = task.id;
            const data = JSON.parse('{ "singleValueExtendedProperties": [ { "id": "String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences", "value":"{}" } ] }');
            await graphPatch(req, res, next,
                `https://graph.microsoft.com/beta/me/outlook/tasks/${id}?${app.graph.queryExpandNagExtensions}`, data);
        }
    });
}

//// Automatic response generators for graph information

async function graphGet(req: restify.Request, res: restify.Response, next: restify.Next, url: string, composer?: (result: any) => string) {
    let errorMessage: string | null = null;
    try {
        const accessToken = await app.authManager.getAccessTokenFromAuthKey(getCookie(req, 'userId'));
        const data = await app.graph.get(accessToken, url);
        if (data) {
            if (composer) {
                res.setHeader('Content-Type', 'text/html');
                res.end(composer(data));
            } else {
                res.json(data);
                res.end();
            }
            return next();
        }
        errorMessage = 'No value';
    } catch (err) {
        errorMessage = 'graphForwarder error.  Detail: ' + err;
    }
    if (composer) {
        res.setHeader('Content-Type', 'text/html');
        res.end(htmlPageFromList('Error', errorMessage, [], '<a href="/">Continue</a>'));
    } else {
        res.status(400);
        res.json({ errorMessage });
        res.end();
    }
    return next();
}

async function graphPatch(req: restify.Request, res: restify.Response, next: restify.Next, url: string, data: string) {
    let errorMessage = '';
    try {
        const accessToken = await app.authManager.getAccessTokenFromAuthKey(getCookie(req, 'userId'));
        const result = await app.graph.patch(accessToken, url, data);
        res.status(200);
        res.json(result);
        res.end();
        return next();
    } catch (err) {
        errorMessage = 'graphForwarder error.  Detail: ' + err;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(htmlPageFromList('Error', errorMessage, [], '<a href="/">Continue</a>'));
    return next();
}

//// Utiliies

function getCookie(req: restify.Request, key: string): string {
    const list = {} as { [index: string]: string };
    const rc = req.header('cookie');

    if (rc) {
        rc.split(';').forEach((cookie) => {
            const parts = cookie.split('=');
            const name = parts.shift().trim();
            if (name) { list[name] = decodeURI(parts.join('=')); }
        });
    }

    return (key && key in list) ? list[key] : null;
}
