import * as dotenv from 'dotenv';
import * as path from 'path';
import { MongoClient } from 'mongodb';

import * as simpleAuth from './simpleAuth';
import * as httpServer from './httpServer';
import * as notifications from './notifications';
import { OfficeGraph } from './officeGraph';
import { NagBot } from './nagbot';
import { User, UsersMap } from './users';
import { ConversationManager } from './conversations';
import { NagBotService } from './nagbotService';
import { BotAdapter } from 'botbuilder';

const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
var appId = process.env.appId;
var appPassword = process.env.appPassword;
var mongoConnection = process.env.mongoConnection;
if (!appId || !appPassword || !mongoConnection) { throw new Error('No app credentials.'); process.exit(); }

export class AppConfig {

    static readonly appId = appId;
    static readonly appPassword = appPassword;
    static readonly mongoConnection = mongoConnection;
    static readonly httpServerPort = process.env.port || process.env.PORT || '8080';
    static readonly httpServerUrl = `http://localhost${AppConfig.httpServerPort.length > 0 ? ':' + AppConfig.httpServerPort : ''}`;
    static readonly authUrl = AppConfig.httpServerUrl + '/auth';
    static readonly botLoginUrl = AppConfig.httpServerUrl + '/bot-login'
    static readonly authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.ReadWrite', 'User.ReadWrite'];
    static readonly botPort = process.env.botport || process.env.BOTPORT || 3978;

}

class App {
    users?: UsersMap;
    authManager?: simpleAuth.AuthManager;
    graph?: OfficeGraph;
    httpServer?: httpServer.Server;
    adapter?: BotAdapter;
    bot?: NagBot;
    conversationManager?: ConversationManager;
    mongoClient?: MongoClient;
}

export var app = new App();

app.graph = new OfficeGraph();

app.authManager = new simpleAuth.AuthManager(AppConfig.appId, AppConfig.appPassword, AppConfig.authUrl, AppConfig.authDefaultScopes);
app.authManager.on('refreshed', () => {
    console.log('refreshed');
});


const botService = new NagBotService(AppConfig.appId, AppConfig.appPassword, AppConfig.botPort);
app.adapter = botService.adapter;
app.bot = botService.bot;
app.adapter.onTurnError = async (turnContext, error) => {
    console.error(`\n[botOnTurnError]: ${error}`);
};

app.conversationManager = botService.conversationManager;
app.conversationManager.on('updated', (oid, conversation) => {
    app.graph.StoreConversation(oid, conversation);
});

app.httpServer = new httpServer.Server(AppConfig.httpServerPort);

MongoClient.connect(AppConfig.mongoConnection, { useNewUrlParser: true }, async (err, client) => {
    if (err) { console.log(`Error: ${err}`); return; }
    console.log('mongo connected');
    app.mongoClient = client;
    let db = app.mongoClient.db('Test');
    let usersDb = db.collection<User>('users');
    app.users = new UsersMap(usersDb);
});

setInterval(async () => {
    console.log(`Tick at (${new Date().toLocaleString()})`);
    await notifications.notify();
}, 11 * 1000);
