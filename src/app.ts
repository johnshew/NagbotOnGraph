import * as dotenv from 'dotenv';
import * as path from 'path';

import * as simpleAuth from './simpleAuth';
import * as httpServer from './httpServer';
import * as graphHelper from './graphHelper';
import { NagBot, UserTracker } from './nagbot';
import { SimpleBotService } from './simpleBotService';

const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
var appId = process.env.appId;
var appPassword = process.env.appPassword;
if (!appId || !appPassword) { throw new Error('No app credentials.'); process.exit(); }

var httpServerPort = process.env.port || process.env.PORT || '8080';
var httpServerUrl = `http://localhost${ httpServerPort.length > 0 ? ':' + httpServerPort : ''}`;
var authUrl = httpServerUrl + '/auth';
var authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.Read', 'User.ReadWrite'];
var botLoginUrl = httpServerUrl + '/bot-login'
var botPort = process.env.botport || process.env.BOTPORT || 3978;

export class AppConfig {
    readonly appId = appId;
    readonly appPassword = appPassword;
    readonly authUrl = authUrl;
    readonly bitLoginUrl = botLoginUrl;
    readonly authDefaultScopes = authDefaultScopes;
    users = new Set<UserTracker>();
    authManager?: simpleAuth.AuthManager;
    graphHelper?: graphHelper.GraphHelper;
    httpServer?: httpServer.Server;
    bot?: NagBot;
}

let app = new AppConfig();

export default app;

app.authManager = new simpleAuth.AuthManager(app.appId, app.appPassword, app.authUrl, app.authDefaultScopes);
app.graphHelper = new graphHelper.GraphHelper();
app.authManager.on('refreshed', () => console.log('refreshed'))

const botService = new SimpleBotService(NagBot, app.appId, app.appPassword, botPort);
app.bot = botService.bot;

app.httpServer = new httpServer.Server(httpServerPort);

function tick() {
    console.log('In tick');
    let users = app.users;
    users.forEach(async u => {
        try {
            let accessToken = await app.authManager.accessTokenForAuthKey(u.authKey);
            let result = await app.graphHelper.get(accessToken, "https://graph.microsoft.com/v1.0/me/");
            console.log(`User: ${JSON.stringify(result)} `);
        } catch (err) {
            console.log(`Error in tick: ${err}`);
        }
    });
}

setInterval(() => tick(), 9 * 1000);
