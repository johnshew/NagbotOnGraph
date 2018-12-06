import { default as app } from './app';
import * as restify from 'restify';
import * as MicrosoftGraph from "@microsoft/microsoft-graph-types"
import * as http from 'http';


// Create the Web Server
export class Server extends http.Server {
    constructor(requestListener?: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
        super(requestListener);
        let This = <http.Server>this;

        let httpServer = restify.createServer();
        This = httpServer;

        let authManager = app.authManager;
        let graphHelper = app.graphHelper;
        let bot = app.bot;
        
        httpServer.use(restify.plugins.bodyParser());
        httpServer.use(restify.plugins.queryParser());
        httpServer.use((req, res, next) => {
            console.log(`Request for ${req.url} `);
            next();
        });

        httpServer.get('/', (req, res, next) => { res.redirect('./public/test.html', next); });

        httpServer.get("/public/*", restify.plugins.serveStatic({ directory: __dirname + '/..' }));

        httpServer.get('/login', (req, res, next) => {
            let authUrl = authManager.authUrl();
            console.log(`redirecting to ${authUrl} `);
            res.redirect(authUrl, next);
        });

        httpServer.get('/bot-login', (req, res, next) => {
            let conversationKey = req.query['conversationKey'] || '';
            let location = req.query['redirectUrl'];
            let authUrl = authManager.authUrl(JSON.stringify({ key: conversationKey, url: location }));
            console.log(`redirecting to ${authUrl}`);
            res.redirect(authUrl, next);
        });

        httpServer.get('/auth', async (req, res, next) => {
            try {
                // look for authorization code coming in (indicates redirect from interative login/consent)
                var code = req.query['code'];
                if (code) {
                    let userAuthKey = await authManager.userAuthKeyFromCode(code);
                    let jwt = authManager.jwtForUserAuthKey(userAuthKey);
                    app.users.add({ oid: jwt.oid, authKey: userAuthKey });
                    res.header('Set-Cookie', 'userId=' + userAuthKey + '; expires=' + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString());
                    let stateString: string = req.query.state;
                    let state: any = {}
                    try { state = JSON.parse(stateString); } catch (e) { }
                    if (!state.url) state.url = '/';
                    if (state.key) {
                        // should send verification code to user via web and wait for it on the bot.
                        // ignore for now.
                        let conversation = await app.bot.convertTempUserConversationKeyToUser(state.key, jwt.oid, userAuthKey);
                        await app.bot.processActivityInConversation(conversation, async (turnContext) => {
                            return await turnContext.sendActivity('Got your web connections.');
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
            let errorMessage: string | null = null;
            try {
                let accessToken = await authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                let data = await graphHelper.get(accessToken, 'https://graph.microsoft.com/v1.0/me/messages');
                if (data) {
                    res.header('Content-Type', 'text/html');
                    res.write(`<html><head></head><body><h1>Mail</h1>`);
                    data.value.forEach(i => { res.write(`<p>${i.subject}</p>`); });
                    res.end('</body></html>');
                    next();
                    return;
                }
                errorMessage = "Request to graph failed.";
            }
            catch (err) { }
            res.setHeader('Content-Type', 'text/html');
            res.end(`<html><head></head><body>${errorMessage || "Not authorized."}<br/><a href="/">Continue</a></body></html>`);
            next();
        });

        httpServer.get('/tasks', async (req, res, next) => {
            let errorMessage: string | null = null;
            try {
                let accessToken = await authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                let data = await graphHelper.get(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks?$filter=categories/any(a:a+eq+'NagMe')`);
                if (data && data.value) {
                    res.header('Content-Type', 'text/html');
                    res.write(`<html><head></head><body><h1>Tasks</h1>`);
                    data.value.forEach(i => { res.write(`<p>${i.subject}</p>`); });
                    res.end(`</body></html>`);
                    next();
                    return;
                }
                errorMessage = "Request to graph failed.";
            }
            catch (err) { }
            res.setHeader('Content-Type', 'text/html');
            res.end(`<html><head></head><body>${errorMessage || "Not authorized."}<br/><a href="/">Continue</a></body></html>`);
            next();
        });

        httpServer.get('/profile', async (req, res, next) => {
            let errorMessage: string | null = null;
            try {
                let accessToken = await authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                let data = await graphHelper.get(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger');
                if (data) {
                    res.header('Content-Type', 'text/html');
                    res.write(`<html><head></head><body><h1>User extension net.shew.nagger</h1>`);
                    res.write(`<p> ${JSON.stringify(data)} </p>`);
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
            let body: MicrosoftGraph.OpenTypeExtension & { time?: string } = { time: new Date().toISOString() };
            try {
                let accessToken = await authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                await graphHelper.patch(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger', body)
            }
            catch (err) {
                console.log(`patch on user extension failed ${err}`);
                responseCode = err;
            }

            if (responseCode == 404) try {
                responseCode = null;
                let accessToken = await authManager.accessTokenForAuthKey(getCookie(req, 'userId'));
                body.extensionName = 'net.shew.nagger';
                body.id = 'net.shew.nagger'
                let location = await graphHelper.post(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions', body);
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
                let jwt = await authManager.jwtForUserAuthKey(getCookie(req, 'userId'));
                let conversations = bot.findAllConversations(jwt.oid);
                conversations.forEach(async c => {
                    await bot.processActivityInConversation(c, async turnContext => {
                        await turnContext.sendActivity('Notification');
                    });
                });
                res.header('Content-Type', 'text/html');
                res.end(`<html><head></head><body><p>User updated</p><a href="/">Continue</a></body></html>`);
                return next();
            }
            catch (err) { }
            res.setHeader('Content-Type', 'text/html');
            res.end(`<html><head></head><body>${errorMessage || "Not authorized."}<br/><a href="/">Continue</a></body></html>`);
            return next();
        });

        httpServer.listen(process.env.port || process.env.PORT || 8080, () => {
            console.log(`\n${httpServer.name} listening to ${httpServer.url}`);
        });
    }
}

function getCookie(req: restify.Request, key: string): string {
    var list = {};
    var rc = req.header('cookie');

    rc && rc.split(';').forEach(cookie => {
        var parts = cookie.split('=');
        var name = parts.shift();
        if (name) list[name] = decodeURI(parts.join('='));
    })

    return (key && key in list) ? list[key] : null;
}
