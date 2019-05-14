import * as restify from 'restify';
import { BotAdapter, BotFrameworkAdapter, ConversationReference, MemoryStorage, Storage, TurnContext } from 'botbuilder';
import { MicrosoftAppCredentials } from 'botframework-connector';

import { NagBot } from './nagbot';
import { ConversationManager } from './conversations';
import { logger } from './utils';

interface BotInterface {
    onTurn(turnContent: TurnContext): void;
};

export class NagBotService {
    public bot: NagBot;
    public storage: Storage;
    public adapter: BotFrameworkAdapter;
    public httpServer: restify.Server;

    constructor(appId: string, appPassword: string, port: string | number, private conversationManager: ConversationManager) {
        this.storage = new MemoryStorage();
        this.adapter = new BotFrameworkAdapter({ appId: appId, appPassword: appPassword });

        try {
            this.bot = new NagBot({ store: this.storage, conversationManager: this.conversationManager });
        } catch (err) {
            console.error(logger`bot Initialization Error`,err);
            throw new Error ('Bot Initialization error');
        }

        // Create bot HTTP server
        this.httpServer = restify.createServer();
        this.httpServer.name = 'BotServer';
        this.httpServer.listen(port, () => {
            console.log(logger`${this.httpServer.name} listening to ${this.httpServer.url}`);
        });

        this.httpServer.post('/api/messages', async (req, res, next) => {
            console.log(logger`botservice got request.`);
            await this.adapter.processActivity(req, res, async (turnContext) => {
                await this.bot.onTurn(turnContext);
            });
            return next();
        });
    }

    async processActivityInConversation(conversation: Partial<ConversationReference>, logic: (turnContext: TurnContext) => Promise<any>) {
        try {
            MicrosoftAppCredentials.trustServiceUrl(conversation.serviceUrl);
            await this.adapter.continueConversation(conversation, async (turnContext) => {
                return await logic(turnContext);
            });
        } catch (err) {
            console.error(logger`problem running activity in conversation.`);
            // throw err;
        }
    }

    async asyncClose(callback?: () => {}): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.httpServer.close(() => {
                console.log(logger`Closed nagbotService`);
                if (callback) callback();
                return resolve();
            })
        });
    }
}
