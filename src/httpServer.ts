import * as http from 'http';
import * as restify from 'restify';
import * as qr from 'qrcode';

import { OpenTypeExtension, OutlookTask } from '@microsoft/microsoft-graph-types-beta';
import { htmlPage, htmlPageFromList, htmlPageFromObject, htmlPageMessage } from './htmlTemplates';
import { app, AppConfig } from './nagbotApp';
import { notifyUser } from './notifications';
import { addMetricsAPI, addResponseMetrics, RequestCounters } from './prometheus';
import { User } from './users';
import { logger } from './utils';

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

    public taskEditUrl(taskId: string) { return `${AppConfig.webServerUrl.href}task/${taskId}`; }  // was encodeURIComponent(taskId)}`; }
    public taskCompleteUrl(taskId: string) { return `${AppConfig.webServerUrl.href}task/${encodeURIComponent(taskId)}/complete`; }
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
        console.log(logger`Request for ${req.url} `);
        next();
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
        const state = { originalUrl: req.query.originalUrl, qrKey: req.query.qrKey };
        const authUrl = app.authManager.authUrl({ redirect: new URL(AppConfig.authPath, protocol + host).href, state: JSON.stringify(state) });
        console.log(logger`redirecting to ${authUrl}`);
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
                res.header('Set-Cookie', 'userId=' + authContext.authKey + '; path=/; expires=' + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString());
                let state: any = {};
                try { state = JSON.parse(req.query.state); } catch (e) {
                    console.log(logger`bad state string`);
                }
                if (!state.originalUrl) { state.originalUrl = '/'; }
                if (state.conversationKey) {
                    // should send verification code to user via web and wait for it on the bot.
                    // ignore for now.
                    const conversation = await app.conversationManager.setOidForUnauthenticatedConversation(state.conversationKey, authContext.oid);
                    await app.botService.processActivityInConversation(conversation, async (turnContext) => {
                        return await turnContext.sendActivity('Connected.');
                    });
                } else if (state.qrKey) {
                    qrLogins.set(state.qrKey, authContext.authKey);
                }
                res.redirect(state.originalUrl, next);
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
                conversationKey,
                redirect: protocol + host + AppConfig.authPath,
                url: location,
            }),

        });
        console.log(logger`redirecting to ${authUrl}`);
        res.redirect(authUrl, next);
    });

    // Authentication logic for QR codes

    const qrLogins = new Map<string, string>();

    httpServer.get('/qr', (req, res, next) => {
        let qrKey = req.query.qrKey || null;

        if (!qrKey) {
            qrKey = 'xyzzy';
            res.redirect(`/qr?qrKey=${qrKey}`, next);
            return;
        }

        if (qrLogins.has(qrKey)) {
            // should check for timeout
            res.header('Set-Cookie', 'userId=' + qrLogins.get(qrKey) + '; path=/; expires=' + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString());
            qrLogins.delete(qrKey);
            res.redirect('/', next);
            return;
        }

        const html =
        /*html*/ `
            <html>
            <head>
                <META HTTP-EQUIV="refresh" CONTENT="15">
            </head>

            <body style="text-align: center; font-family: 'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif">
                <img src='/qr-code/${qrKey}' /><br />
                This will automatically refresh<br/><br/>
                <a href='/qr?qrKey=${qrKey}'>Continue</a>
            </body>

            </html>`;
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
        next();
    });

    httpServer.get('/qr-code/:tempUserId', (req, res, next) => {
        // check to see if the QR code has been approved or timed out
        const loginUrl = `${AppConfig.webServerUrl.href}login?qrKey=${req.params.tempUserId}`;
        console.log(logger`QR Login URL ${loginUrl}`);
        res.setHeader('Content-type', 'image/png');
        qr.toFileStream(res, loginUrl,
            { scale: 10 },
            (err) => {
                res.end();
                next();
            });
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
        } catch (err) { error = err; }
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

    httpServer.get('/test-cookies', (req, res, next) => {
        const cookies = req.headers.cookie;
        const html =
    /*html*/ `
        <html>
        <head>
            <META HTTP-EQUIV="refresh" CONTENT="15">
        </head>

        <body style="text-align: center; font-family: 'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif">
            current cookies: ${cookies}
        </body>
        </html>`;
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
        next();
    });

    httpServer.get('/test-set-cookie', (req, res, next) => {
        const cookies = req.headers.cookie;
        const html =
    /*html*/ `
        <html>
        <head>
            <META HTTP-EQUIV="refresh" CONTENT="15">
        </head>

        <body style="text-align: center; font-family: 'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif">
            Cookie should be set.<br/>
            <br/>
            <a href='/test-cookies'>Show cookies</a>
        </body>
        </html>`;
        res.setHeader('Set-Cookie', 'userId=' + 'xyzzy' + '; path=/; expires=' + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString());
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
        next();
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
        res.json(200, result);
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
