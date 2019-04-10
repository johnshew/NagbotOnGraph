import * as dotenv from 'dotenv';
import * as path from 'path';
import { MongoClient } from 'mongodb';
import * as util from 'util';

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

export class AppConfig {
    static readonly appId = process.env.appId;
    static readonly appPassword = process.env.appPassword;
    static readonly mongoConnection = process.env.mongoConnection;
    static readonly httpServerPort = process.env.port || process.env.PORT || '8080';
    static readonly httpServerUrl = `http://localhost${AppConfig.httpServerPort.length > 0 ? ':' + AppConfig.httpServerPort : ''}`;
    static readonly authUrl = AppConfig.httpServerUrl + '/auth';
    static readonly botLoginUrl = AppConfig.httpServerUrl + '/bot-login'
    static readonly authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.ReadWrite', 'User.ReadWrite'];
    static readonly botPort = process.env.botport || process.env.BOTPORT || 3978;
}


if (!AppConfig.appId || !AppConfig.appPassword || !AppConfig.mongoConnection) { throw new Error('No app credentials.'); process.exit(); }

class App {
    ready: Promise<App>;
    users?: UsersMap;
    authManager?: simpleAuth.AuthManager;
    graph?: OfficeGraph;
    httpServer?: httpServer.Server;
    botService?: NagBotService;
    adapter?: BotAdapter;
    bot?: NagBot;
    conversationManager?: ConversationManager;
    mongoClient?: MongoClient;
    timer: NodeJS.Timeout;

    constructor() {

        this.ready = new Promise((resolve, reject) => {
            try {
                this.graph = new OfficeGraph();

                this.authManager = new simpleAuth.AuthManager(AppConfig.appId, AppConfig.appPassword, AppConfig.authUrl, AppConfig.authDefaultScopes);
                this.authManager.on('refreshed', () => {
                    console.log('refreshed');
                });


                this.botService = new NagBotService(AppConfig.appId, AppConfig.appPassword, AppConfig.botPort);
                this.adapter = this.botService.adapter;
                this.bot = this.botService.bot;
                this.adapter.onTurnError = async (turnContext, error) => {
                    console.error(`\n[botOnTurnError]: ${error}`);
                };

                this.conversationManager = this.botService.conversationManager;
                this.conversationManager.on('updated', (oid, conversation) => {
                    this.graph.StoreConversation(oid, conversation);
                });

                this.httpServer = new httpServer.Server(AppConfig.httpServerPort);

                MongoClient.connect(AppConfig.mongoConnection, { useNewUrlParser: true }, async (err, client) => {
                    if (err) { console.log(`Error: ${err}`); return; }
                    console.log('mongo connected');
                    this.mongoClient = client;
                    let db = this.mongoClient.db('Test');
                    let usersDb = db.collection<User>('users');
                    this.users = new UsersMap(usersDb);
                    await this.users.ready;
                    resolve();
                });
            } catch (err) {
                console.log("Initialization failed", err);
                reject();
            }
        });

        this.timer = setInterval(async () => {
            try {
                await app.ready;
                console.log(`Tick at (${new Date().toLocaleString()})`);
                await notifications.notify();
            } catch (err) {
                console.log('Error in notifications timer', err);
            }
        }, 11 * 1000);

    }

    async close(): Promise<void> {
        if (!this.timer) { throw new Error('No timer'); } else {
            clearInterval(this.timer);
        }
        await this.httpServer.asyncClose();
        await this.botService.asyncClose();
        await this.mongoClient.close();
        return;
    }
}

export var app = new App();
