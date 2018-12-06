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

var httpServerUrl = 'http://localhost:8080';
var authUrl = httpServerUrl + '/auth';
var authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.Read', 'User.ReadWrite'];
var botLoginUrl = httpServerUrl + '/bot-login'

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

const botService = new SimpleBotService(NagBot, app.appId, app.appPassword, process.env.port || process.env.PORT || 3978);
app.bot = botService.bot;

app.httpServer = new httpServer.Server();
