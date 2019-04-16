import * as dotenv from 'dotenv';
import * as path from 'path';

import { MongoClient } from 'mongodb';

import { AuthManager } from './simpleAuth';
import { OfficeGraph } from './officeGraph';
import { Server as AppHttpServer } from './httpServer';
import { UsersMongo } from './usersMongo';
import { ConversationManager } from './conversations';
import { NagBotService } from './nagbotService';
import { notify as notificationHandler } from './notifications';

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
    static readonly luisId = process.env.luisId;
    static readonly luisKey = process.env.luisKey;
    static readonly luisStaging = false;
    static readonly notificationCheckFrequency = 11 * 60 * 1000;
}

if (!(AppConfig.appId && AppConfig.appPassword && AppConfig.mongoConnection && AppConfig.luisId)) { throw new Error('Missing app config.'); process.exit(); }

class App {
    // This is a namespace to the set of centralized services used throughout the application.
    ready: Promise<App>;
    users: UsersMongo;
    appHttpServer: AppHttpServer;
    botService: NagBotService;
    conversationManager: ConversationManager;
    authManager: AuthManager;
    graph: OfficeGraph;
    timer: NodeJS.Timeout;

    constructor() {

        this.ready = new Promise(async (resolve, reject) => {
            try {
                this.authManager = new AuthManager(AppConfig.appId, AppConfig.appPassword, AppConfig.authUrl, AppConfig.authDefaultScopes);
                this.authManager.on('refreshed', () => {
                    console.log('user auth token was refreshed');
                });
                this.graph = new OfficeGraph();
                this.conversationManager = new ConversationManager();
                this.conversationManager.on('updated', (oid, conversation, conversations) => {
                    console.log('Saving user oid:', oid);
                    this.graph.setConversations(oid, conversations.findAll(oid));
                });
                this.botService = new NagBotService(AppConfig.appId, AppConfig.appPassword, AppConfig.botPort, this.conversationManager);
                this.botService.adapter.onTurnError = async (turnContext, error) => {
                    console.error(`[botOnTurnError]: ${error}`);
                };
                this.appHttpServer = new AppHttpServer(AppConfig.httpServerPort);

                this.users = new UsersMongo(AppConfig.mongoConnection);

                await this.users.ready;

                resolve();
            }
            catch (err) {
                console.log("Initialization failed", err);
                reject();
            }
        });

        this.timer = setInterval(async () => {
            try {
                await app.ready;
                console.log(`Tick at (${new Date().toLocaleString()})`);
                await notificationHandler();
            } catch (err) {
                console.log('Error in notifications timer', err);
            }
        }, AppConfig.notificationCheckFrequency);

    }

    async close(): Promise<void> {
        if (!this.timer) { throw new Error('No timer'); } else {
            clearInterval(this.timer);
        }
        await this.appHttpServer.asyncClose();
        await this.botService.asyncClose();
        await this.users.close();
        return;
    }
}

export var app = new App();
