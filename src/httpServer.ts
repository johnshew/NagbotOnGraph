
import * as restify from 'restify';
import * as http from 'http';

import { app } from './app';
import { OutlookTask, OpenTypeExtension } from '@microsoft/microsoft-graph-types-beta';


// Create the Web Server
export class Server  {
    server : restify.Server;
    constructor(port: string, requestListener?: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
        // super(requestListener);

        this.server = restify.createServer(<restify.ServerOptions>{ maxParamLength: 1000 });

        let httpServer = this.server;

        httpServer.pre((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "X-Requested-With");
            return next();
        });

        httpServer.use(restify.plugins.bodyParser());
        httpServer.use(restify.plugins.queryParser());


        httpServer.use((req, res, next) => {
            console.log(`Request for ${req.url} `);
            next();
        });

        httpServer.get('/', (req, res, next) => { res.redirect('./public/app.html', next); });

        httpServer.get("/public/*", restify.plugins.serveStatic({ directory: __dirname + '/..' }));

        httpServer.get('/login', (req, res, next) => {
            let authUrl = app.authManager.authUrl();
            console.log(`redirecting to ${authUrl} `);
            res.redirect(authUrl, next);
        });

        httpServer.get('/bot-login', (req, res, next) => {
            let conversationKey = req.query['conversationKey'] || '';
            let location = req.query['redirectUrl'];
            let authUrl = app.authManager.authUrl(JSON.stringify({ key: conversationKey, url: location }));
            console.log(`redirecting to ${authUrl}`);
            res.redirect(authUrl, next);
        });

        httpServer.get('/auth', async (req, res, next) => {
            try {
                // look for authorization code coming in (indicates redirect from interative login/consent)
                var code = req.query['code'];
                if (code) {
                    let userAuthKey = await app.authManager.userAuthKeyFromCode(code);
                    let jwt = app.authManager.jwtForUserAuthKey(userAuthKey);
                    let authTokens = app.authManager.userAuthKeyToTokensMap.get(userAuthKey);
                    await app.users.set(jwt.oid, { oid: jwt.oid, authKey: userAuthKey, authTokens: authTokens });
                    res.header('Set-Cookie', 'userId=' + userAuthKey + '; expires=' + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString());
                    let stateString: string = req.query.state;
                    let state: any = {}
                    try { state = JSON.parse(stateString); } catch (e) { }
                    if (!state.url) state.url = '/';
                    if (state.key) {
                        // should send verification code to user via web and wait for it on the bot.
                        // ignore for now.
                        let conversation = await app.conversationManager.setOidForUnauthenticatedConversation(state.key, jwt.oid);
                        await app.botService.processActivityInConversation(conversation, async (turnContext) => {
                            return await turnContext.sendActivity('Got your web connection.');
                        });
                    }
                    res.redirect(state.url, next);
                    res.end();
                    return;
                }
            }
            catch (reason) {
                console.log('Error in /auth processing: ' + reason)
            }
            res.setHeader('Content-Type', 'text/html');
            res.end('<html><head></head><body>Request to authorize failed<br/><a href="/">Continue</a></body></html>');
            next();
            return;
        });

        httpServer.get('/mail', async (req, res, next) => {
            await graphGet(req, res, next, 'https://graph.microsoft.com/beta/me/messages', (data: { value: OutlookTask[] }) => {
                let subjects = data.value.map(tasks => 'Subject: ' + tasks.subject);
                return templateHtmlResponse('Mail', '', subjects, '<a href="/">Continue</a>');
            })
        });

        httpServer.get('/tasks', async (req, res, next) => {
            await graphGet(req, res, next, "https://graph.microsoft.com/beta/me/outlook/tasks?filter=(status eq 'notStarted') and (categories/any(a:a+eq+'NagMe'))", (data: { value: OutlookTask[] }) => {
                let subjects = data.value.map(task => 'Subject: ' + task.subject);
                return templateHtmlResponse('Tasks', '', subjects, '<a href="/">Continue</a>');
            })
        });

        httpServer.get('/profile', async (req, res, next) => {
            let errorMessage: string | null = null;
            try {
                let accessToken = await app.authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                let data = await app.graph.get(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger');
                if (data) {
                    res.header('Content-Type', 'text/html');
                    res.write(`<html><head></head><body><h1>User extension net.shew.nagger</h1>`);
                    res.write(`<pre> ${JSON.stringify(data,null,2)} </pre>`);
                    res.end(`</body></html>`);
                    next();
                    return;
                }
                errorMessage = "Request to graph failed.";
            }
            catch (err) {
                console.log(`get on user extension failed ${err}`);
            }
            res.setHeader('Content-Type', 'text/html');
            res.end(`<html><head></head><body>${errorMessage || "Not authorized."}<br/><a href="/">Continue</a></body></html>`);
            next();
        });

        httpServer.get('/update', async (req, res, next) => {
            let responseCode: number | null = null;
            let body: OpenTypeExtension & { time?: string } = { time: new Date().toISOString() };
            try {
                let accessToken = await app.authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                await app.graph.patch(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger', body)
            }
            catch (err) {
                console.log(`patch on user extension failed ${err}`);
                responseCode = err;
            }

            if (responseCode == 404) try {
                responseCode = null;
                let accessToken = await app.authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                body.extensionName = 'net.shew.nagger';
                body.id = 'net.shew.nagger'
                let location = await app.graph.post(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions', body);
            } catch (err) {
                console.log(`post on user extension failed ${err}`);
                responseCode = err;
            }

            res.setHeader('Content-Type', 'text/html');
            if (!responseCode) {
                res.end(`<html><head></head><body><p>User updated</p><a href="/">Continue</a></body></html>`);
                return next();
            } else {
                res.end('<html><head></head><body>Unable to update user information<br/><a href="/">Continue</a></body></html>');
                return next();
            }
        });

        httpServer.get('/notify', async (req, res, next) => {
            let errorMessage: string | null = null;
            try {
                let jwt = await app.authManager.jwtForUserAuthKey(getCookie(req, 'userId'));
                let conversations = app.conversationManager.findAll(jwt.oid);
                conversations.forEach(async c => {
                    await app.botService.processActivityInConversation(c, async turnContext => {
                        await turnContext.sendActivity('Notification');
                    });
                });
                res.header('Content-Type', 'text/html');
                res.end(`<html><head></head><body><p>Notified</p><a href="/">Continue</a></body></html>`);
                return next();
            }
            catch (err) { }
            res.setHeader('Content-Type', 'text/html');
            res.end(`<html><head></head><body>${errorMessage || "Not authorized."}<br/><a href="/">Continue</a></body></html>`);
            return next();
        });

        httpServer.get('/edit-task', async (req, res, next) => {
            try {
                let jwt = await app.authManager.jwtForUserAuthKey(getCookie(req, 'userId'));
                let oid = req.query['oid'];
                let taskId = req.query['taskid'];
                if (!jwt || !jwt.oid || !oid || !taskId) throw (`edit-task missing parameters`);
                if (jwt.oid != oid) {
                    console.log('not legged in');
                    return res.redirect('/', next);
                }
                let accessToken = await app.authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                let data = await app.graph.get(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks/${taskId}?${app.graph.Expand}`);
                res.setHeader('Content-Type', 'text/html');
                res.end(templateHtmlResponse('task', `<pre>${JSON.stringify(data, null, 2)}</pre>`,[],""));
                return next();
            } catch (err) {
                console.log(`/edit-task failed. (${err}()`);
                return next();
            }
        });

        httpServer.get('/complete-task', async (req, res, next) => {
            try {
                let jwt = await app.authManager.jwtForUserAuthKey(getCookie(req, 'userId'));
                let oid = req.query['oid'];
                let taskId = req.query['taskid'];
                if (!jwt || !jwt.oid || !oid || !taskId) throw (`edit-task missing parameters`);
                if (jwt.oid != oid) {
                    console.log('not legged in');
                    return res.redirect('/', next);
                }
                let accessToken = await app.authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                let body : OutlookTask = { status: "completed" };

                await app.graph.patch(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks/${taskId}`, body)
     
                .catch(err => { throw Error(`Notify/patch failed (${err})`) });
                let data = await app.graph.get(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks/${taskId}?${app.graph.Expand}`);
                res.setHeader('Content-Type', 'text/html');
                let text = `<pre>${JSON.stringify(data,null,2)}</pre>`;
                res.end(templateHtmlResponse('task', text, [], ""));
                return next();
            } catch (err) {
                console.log(`/complete-task failed. (${err})`);
                res.send(404,JSON.stringify(err));
                res.end();
                return next()
            }
        });


        httpServer.get('/api/v1.0/tasks', async (req, res, next) => {
            await graphGet(req, res, next, `https://graph.microsoft.com/beta/me/outlook/tasks?${app.graph.FilterNotCompletedAndNagMeCategory}&${app.graph.Expand}`);
            // https://graph.microsoft.com/beta/me/outlook/tasks?filter=(dueDateTime/DateTime) gt  '2018-12-04T00:00:00Z'
        })

        httpServer.get('/api/v1.0/tasks/:id', async (req, res, next) => {
            let id = req.params["id"];
            await graphGet(req, res, next, `https://graph.microsoft.com/beta/me/outlook/tasks/${id}?${app.graph.Expand}`);
        })

        httpServer.patch('/api/v1.0/tasks/:id', async (req, res, next) => {
            let id = req.params["id"];
            let data = req.body;
            await graphPatch(req, res, next, `https://graph.microsoft.com/beta/me/outlook/tasks/${id}?${app.graph.Expand}`, data);
        })

        httpServer.get('/test-patch', async (req, res, next) => {
            let tasks = await graphGet(req, res, next, `https://graph.microsoft.com/beta/me/outlook/tasks?${app.graph.FilterNotCompletedAndNagMeCategory}&${app.graph.Expand}`);
            if (tasks && tasks.value && Array.isArray(tasks.value) && tasks.value.length > 0) {
                let task = <OutlookTask>tasks.value[0];
                let id = task.id;
                let data = JSON.parse("{ \"singleValueExtendedProperties\": [ { \"id\": \"String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences\", \"value\":\"{}\" } ] }");
                await graphPatch(req, res, next, `https://graph.microsoft.com/beta/me/outlook/tasks/${id}?${app.graph.Expand}`, data);
            }
        });

        httpServer.get('/api/v1.0/me', async (req, res, next) => {
            await graphGet(req, res, next, "https://graph.microsoft.com/v1.0/me");
        })

        httpServer.listen(port, () => {
            console.log(`\n${httpServer.name} listening to ${httpServer.url}`);
        });
    }

    async asyncClose(callback? : () => void) : Promise<void> {
        return new Promise<void>((resolve, reject)=>{
            this.server.close(()=>{
                console.log('Closed httpServer');
                if (callback) callback();
                return resolve();
            })
        });
    }
}

function getCookie(req: restify.Request, key: string): string {
    var list = <{ [index: string]: string }>{};
    var rc = req.header('cookie');

    rc && rc.split(';').forEach(cookie => {
        var parts = cookie.split('=');
        var name = parts.shift();
        if (name) list[name] = decodeURI(parts.join('='));
    })

    return (key && key in list) ? list[key] : null;
}

function templateHtmlList(list: string[]) {
    if (!list || list.length === 0) return '';
    let items = list.reduce<string>((prev, current) => { return (prev + '<li>' + current + '</li>') }, '');
    return `<ul> ${items} </ul>`
}

function templateHtmlResponse(title: string, message: string, list: string[], footer: string) {
    return `<html>

<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title> ${ title} </title>
    <link type="text/css" rel="stylesheet" href="https://unpkg.com/css-type-base/index.css" />
</head>

<body>
    <h2>${ title}</h2>    
    <div>${ message}</div>
    ${ templateHtmlList(list)}
    <div> ${ footer} <div>
</body>

</html>`
}

async function graphGet(req: restify.Request, res: restify.Response, next: restify.Next, url: string, composer?: (result: any) => string): Promise<any> {
    let errorMessage: string | null = null;
    try {
        let accessToken = await app.authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
        let data = await app.graph.get(accessToken, url);
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
    }
    catch (err) {
        errorMessage = 'graphForwarder error.  Detail: ' + err;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(templateHtmlResponse('Error', errorMessage, [], '<a href="/">Continue</a>'));
    return next();
}


async function graphPatch(req: restify.Request, res: restify.Response, next: restify.Next, url: string, data: string) {
    let errorMessage = "";
    try {
        let accessToken = await app.authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
        let result = await app.graph.patch(accessToken, url, data);
        return next();
    }
    catch (err) {
        errorMessage = 'graphForwarder error.  Detail: ' + err;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(templateHtmlResponse('Error', errorMessage, [], '<a href="/">Continue</a>'));
    return next();
}