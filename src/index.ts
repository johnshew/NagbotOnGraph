
import { BotFrameworkAdapter, MemoryStorage, ConversationState, UserState } from 'botbuilder';
import * as dotenv from "dotenv";
import * as path from 'path';
import * as restify from 'restify';
import { NagBot } from './nagbot';
import { GraphHelper } from './graphHelper';
import { AuthManager } from './simpleAuth';
import * as MicrosoftGraph from "@microsoft/microsoft-graph-types"

const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
var botId = process.env.botAppId;
var botPassword = process.env.botAppPassword;
if (!botId || !botPassword) { throw new Error('No app credentials.'); process.exit(); }

var httpServerUrl = 'http://localhost:8080';
var authUri = httpServerUrl + '/auth';
var defaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.Read', 'User.ReadWrite'];
let authManager = new AuthManager(botId, botPassword, authUri, defaultScopes);
let graphHelper = new GraphHelper();
authManager.on('refreshed', () => console.log('refreshed'))


const adapter = new BotFrameworkAdapter({ appId: botId, appPassword: botPassword });

// Catch-all for errors.
adapter.onTurnError = async (turnContext, error) => {
    console.error(`\n[botOnTurnError]: ${error}`);
    await turnContext.sendActivity(`Oops. Something went wrong!`);
};

const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);
const userState = new UserState(memoryStorage);

let bot: NagBot;
try {
    bot = new NagBot(conversationState, userState);
} catch (err) {
    console.error(`[botInitializationError]: ${err}`);
    process.exit();
}

// Create bot HTTP server
let botServer = restify.createServer();
botServer.name = 'BotServer';
botServer.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log(`\n${botServer.name} listening to ${botServer.url}`);
});

// Listen for incoming bot requests.
botServer.post('/api/messages', async (req, res) => {
    await adapter.processActivity(req, res, async (turnContext) => {
        await bot.onTurn(turnContext);
    });
});


let httpServer = restify.createServer();

httpServer.use(restify.plugins.bodyParser());
httpServer.use(restify.plugins.queryParser());
httpServer.use((req, res, next) => {
    console.log(`Request for ${req.url}`); next();
});

// Make it a web server
httpServer.get('/', (req, res, next) => {
    res.redirect('./public/test.html', next);
});

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
            let userAuthSecret = await authManager.userAuthKeyFromCode(code);
            let jwt = authManager.jwtForUserAuthKey(userAuthSecret);
            res.header('Set-Cookie', 'userId=' + userAuthSecret + '; expires=' + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString());
            let stateString: string = req.query.state;
            let state: any = {}
            try { state = JSON.parse(stateString); } catch (e) { }
            if (!state.url) state.url = '/';
            if (state.key) {
                // should send verification code to user via web and wait for it on the bot.
                // ignore for now.
                let conversation = await bot.finishUserConversationKeyToOidAssociation(state.key, jwt.oid, userAuthSecret);
                await bot.processActivityInConversation(conversation, async (turnContext) => {
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
