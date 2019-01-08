import * as dotenv from 'dotenv';
import * as path from 'path';
import { MongoClient as mongoClient, MongoClient, Collection } from 'mongodb';
import { OutlookTask, User } from "@microsoft/microsoft-graph-types-beta";

import * as simpleAuth from './simpleAuth';
import * as httpServer from './httpServer';
import * as graphHelper from './graphHelper';
import { NagBot, ConversationManager } from './nagbot';
import { AppUser } from './users';
import { NagBotService } from './simpleBotService';
import { nagExpand, nagFilterNotCompletedAndNagMeCategory, StoreConversation } from './nagGraph';
import { BotAdapter } from 'botbuilder';

const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
var appId = process.env.appId;
var appPassword = process.env.appPassword;
var mongoConnection = process.env.mongoConnection;

if (!appId || !appPassword || !mongoConnection) { throw new Error('No app credentials.'); process.exit(); }

var httpServerPort = process.env.port || process.env.PORT || '8080';
var httpServerUrl = `http://localhost${httpServerPort.length > 0 ? ':' + httpServerPort : ''}`;
var authUrl = httpServerUrl + '/auth';
var authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.Read', 'User.ReadWrite'];
var botLoginUrl = httpServerUrl + '/bot-login'
var botPort = process.env.botport || process.env.BOTPORT || 3978;


class MongoUsersMap {
    data = new Map<string, AppUser>();

    constructor(private mongoCollection: Collection<AppUser>) {
        this.mongoCollection.find().toArray().then(users => {
            console.log(`Loaded users: ${JSON.stringify(users)}`);
            users.forEach(user => {
                this.data.set(user.oid, user);
                app.authManager.setTokensForUserAuthKey(user.authTokens.auth_secret, user.authTokens);
            });
        });
    }

    get(oid: string) { return this.data.get(oid); }

    async set(oid: string, user: AppUser) {
        this.data.set(oid, user);
        let op = await this.mongoCollection.update({ "oid": oid }, user, { upsert: true });
        console.log(op.result.ok == 1 ? `stored user` : `write failure`);
    }


    forEach(callback: (value: AppUser, key: string, map: MongoUsersMap) => void, thisArg?: any) {
        this.data.forEach((u, k, m) => { callback(u, k, this); }, thisArg);
    }
}

export class AppConfig {
    readonly appId = appId;
    readonly appPassword = appPassword;
    readonly mongoConnection = mongoConnection;
    readonly authUrl = authUrl;
    readonly botLoginUrl = botLoginUrl;
    readonly authDefaultScopes = authDefaultScopes;
    users?: MongoUsersMap;
    authManager?: simpleAuth.AuthManager;
    graphHelper?: graphHelper.GraphHelper;
    httpServer?: httpServer.Server;
    adapter? : BotAdapter;
    bot?: NagBot;
    conversationManager? : ConversationManager;
    mongoClient?: MongoClient;
}

let app = new AppConfig();

export default app;

app.graphHelper = new graphHelper.GraphHelper();
app.authManager = new simpleAuth.AuthManager(app.appId, app.appPassword, app.authUrl, app.authDefaultScopes);
app.authManager.on('refreshed', () => console.log('refreshed'))


const botService = new NagBotService(app.appId, app.appPassword, botPort);
app.bot = botService.bot;
app.conversationManager = botService.conversationManager;
app.conversationManager.on('updated', (oid, conversation) => StoreConversation(oid,conversation));
app.adapter = botService.adapter;

app.httpServer = new httpServer.Server(httpServerPort);

if (app.mongoConnection) {
    mongoClient.connect(app.mongoConnection, { useNewUrlParser: true }, async (err, client) => {
        console.log('mongo connected');
        app.mongoClient = client;
        let db = app.mongoClient.db('Test');
        let usersDb = db.collection<User>('users');
        app.users = new MongoUsersMap(usersDb);
    });
}



function tick() {
    console.log(`Tick (${new Date().toLocaleString()})`);
    let users = app.users;
    users.forEach(async (user, key) => {
        try {
            let oid = app.authManager.jwtForUserAuthKey(user.authKey).oid;
            let accessToken = await app.authManager.accessTokenForAuthKey(user.authKey);
            console.log(`User: ${oid}`);
            let tasks = await app.graphHelper.get<{ value: [OutlookTask] }>(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks?${nagFilterNotCompletedAndNagMeCategory}&${nagExpand}`);
            if (tasks && tasks.value) tasks.value.forEach((task) => {
                console.log(`${task.subject} ${task.dueDateTime && task.dueDateTime.dateTime}`);
                let conversations = app.conversationManager.findAllConversations(oid);
                if (conversations) conversations.forEach(async c => {
                    await app.conversationManager.processActivityInConversation(app.adapter, c, async turnContext => {
                        await turnContext.sendActivity('You should take care of ' + task.subject);
                    });
                });
            });
        }
        catch (err) {
            console.log(`Error in tick: ${err}`);
        }
    });
}

setInterval(() => tick(), 9 * 1000);


