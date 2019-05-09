
import { logger } from './utils';
console.log(logger`loading app`);
import { AuthManager } from './simpleAuth';
import { OfficeGraph } from './officeGraph';
import { Server as AppHttpServer } from './httpServer';
import { UsersMongo } from './usersMongo';
import { ConversationManager } from './conversations';
import { NagBotService } from './nagbotService';
import { notify as notificationHandler } from './notifications';


import * as dotenv from 'dotenv';
import * as path from 'path';
const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });

export class AppConfig {
    static readonly appId = process.env.appId;
    static readonly appPassword = process.env.appPassword;
    static readonly mongoConnection = process.env.mongoConnection;
    static readonly httpLocalServerPort = process.env.port || process.env.PORT || '8080';
    static readonly publicServer = new URL("https://nagbotdev.shew.net");
    static readonly authPath = '/auth';
    static readonly authUrl = new URL(AppConfig.authPath, AppConfig.publicServer); // AppConfig.publicServer.href + AppConfig.authPath;
    static readonly botLoginPath = '/bot-login';
    static readonly botLoginUrl = AppConfig.publicServer.href + AppConfig.botLoginPath
    static readonly authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.ReadWrite', 'User.ReadWrite'];
    static readonly botPort = process.env.botport || process.env.BOTPORT || 3978;
    static readonly luisId = process.env.luisId;
    static readonly luisKey = process.env.luisKey;
    static readonly luisStaging = false;
    static readonly notificationCheckFrequency = 1 /* minutes */ * 60 * 1000;
    static readonly dueTodayPolicyInterval = 2; /* minutes */
}

if (!(AppConfig.appId && AppConfig.appPassword && AppConfig.mongoConnection && AppConfig.luisId)) { throw new Error('Missing app config.'); process.exit(); }

export class App {
    // This is a namespace to the set of centralized services used throughout the application.
    ready: Promise<App> = null;
    users: UsersMongo = null;
    appHttpServer: AppHttpServer;
    botService: NagBotService;
    conversationManager: ConversationManager;
    authManager: AuthManager;
    graph: OfficeGraph;
    timer: NodeJS.Timeout;

    constructor() {

        this.ready = new Promise(async (resolve, reject) => {
            try {
                this.authManager = new AuthManager(AppConfig.appId, AppConfig.appPassword, AppConfig.authUrl.href, AppConfig.authDefaultScopes);
                this.authManager.on('refreshed', (context) => {
                    console.log(logger`user auth context was refreshed`, context);
                });
                this.graph = new OfficeGraph();
                this.conversationManager = new ConversationManager();
                this.conversationManager.on('updated', (oid, conversation, conversations) => {
                    if (!this.users) throw ('need users');
                    let user = this.users.get(oid); 
                    let userConversations = conversations.findAll(oid);
                    console.log(logger`updating ${userConversations.length } conversations for ${ user.preferredName }`);
                    this.graph.setConversations(oid, conversations.findAll(oid))
                        .catch((reason) => { throw new Error(`unable to store conversations ${reason}`) });
                });
                this.botService = new NagBotService(AppConfig.appId, AppConfig.appPassword, AppConfig.botPort, this.conversationManager);
                this.botService.adapter.onTurnError = async (turnContext, error) => {
                    console.error(`[botOnTurnError]: ${error}`);
                };
                this.appHttpServer = new AppHttpServer(AppConfig.httpLocalServerPort);

                this.users = await new UsersMongo(AppConfig.mongoConnection).ready;

                resolve();
            }
            catch (err) {
                console.log(logger`initialization failed`, err);
                reject();
            }
        });

        this.timer = setInterval(async () => {
            try {
                await app.ready;
                console.log(logger`tick`);
                await notificationHandler();
            } catch (err) {
                console.log(logger`error in notifications timer`, err);
            }
        }, AppConfig.notificationCheckFrequency);

    }

    async close(): Promise<void> {
        if (!this.timer) { throw new Error('no timer'); } else {
            clearInterval(this.timer);
        }
        await this.appHttpServer.asyncClose();
        await this.botService.asyncClose();
        await this.users.close();
        return;
    }
}

export var app : App = null;
async function start() {
    try {
        app = new App();
        await app.ready;
        console.log(logger`app started`);
    } catch (err) {
        console.log(logger`app start failed`,err);
    }
}

start();
