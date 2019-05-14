
import { logger } from './utils';
console.log(logger`loading app`);

import { AppConfig } from './config';
export { AppConfig } from './config';
import { AuthManager } from './simpleAuth';
import { OfficeGraph } from './officeGraph';
import { Server as AppHttpServer } from './httpServer';
import { UsersMongo } from './usersMongo';
import { ConversationManager } from './conversations';
import { NagBotService } from './nagbotService';
import { notify as notificationHandler } from './notifications';

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
                this.authManager = new AuthManager(AppConfig.appId, AppConfig.appPassword, 'error', AppConfig.authDefaultScopes);
                this.authManager.on('refreshed', (context) => {
                    console.log(logger`user auth context was refreshed`, context);
                });
                this.graph = new OfficeGraph();
                this.conversationManager = new ConversationManager();
                this.conversationManager.on('updated', async (oid, conversation) => {
                    if (!this.users) throw ('need users');
                    let user = this.users.get(oid);
                    let userConversations = this.conversationManager.findAll(oid);
                    console.log(logger`updating ${userConversations.length} conversations for ${user.preferredName}`);
                    let accessToken = await this.authManager.getAccessTokenFromOid(oid);
                    this.graph.setConversations(accessToken, userConversations)
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

    }

    async start(): Promise<App> {
        try {
            await this.ready;
            this.timer = setInterval(async () => {
                try {
                    await this.ready;
                    console.log(logger`tick`);
                    await notificationHandler();
                } catch (err) {
                    console.log(logger`error in notifications timer`, err);
                }
            }, AppConfig.notificationCheckFrequency);
            console.log(logger`app started`);
            return this;
        } catch (err) {
            console.log(logger`app start failed`, err);
        }
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

export async function create() {
    if (!app) { app = new App() }
    await app.ready;
    await app.start();
    return app;
}
