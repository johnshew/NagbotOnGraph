import { BotAdapter, BotFrameworkAdapter, ConversationReference, MemoryStorage, Storage, TurnContext } from 'botbuilder';
import { MicrosoftAppCredentials } from 'botframework-connector';
import * as restify from 'restify';

import { ResourceResponse } from 'botframework-connector/lib/connectorApi/models/mappers';
import { response } from 'spdy';
import { ConversationManager } from './conversations';
import { NagBot } from './nagbot';
import { logger } from './utils';

interface IBotInterface {
    onTurn(turnContent: TurnContext): void;
}

export class NagBotService {
    public bot: NagBot;
    public storage: Storage;
    public adapter: BotFrameworkAdapter;
    public httpServer: restify.Server;

    constructor(appId: string, appPassword: string, port: string | number, private conversationManager: ConversationManager) {
        this.storage = new MemoryStorage();
        this.adapter = new BotFrameworkAdapter({ appId, appPassword });

        try {
            this.bot = new NagBot({ store: this.storage, conversationManager: this.conversationManager });
        } catch (err) {
            console.error(logger`bot Initialization Error`, err);
            throw new Error('Bot Initialization error');
        }

        // Create bot HTTP server
        this.httpServer = restify.createServer();
        this.httpServer.name = 'BotServer';
        this.httpServer.listen(port, () => {
            console.log(logger`${this.httpServer.name} listening to ${this.httpServer.url}`);
        });

        this.httpServer.post('/api/messages', async (req, res, next) => {
            console.log(logger`botservice got request.`);
            try {
                await this.adapter.processActivity(req, res, async (turnContext) => {
                    await this.bot.onTurn(turnContext);
                });
            } catch (err) { console.error(logger`bot service error handling POST to /api/messages`, err); }
            return next();
        });
    }

    public async processActivityInConversation(conversation: Partial<ConversationReference>, logic: (turnContext: TurnContext) => Promise<any>) {
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

    public async asyncClose(callback?: () => {}): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.httpServer.close(() => {
                console.log(logger`Closed nagbotService`);
                if (callback) { callback(); }
                return resolve();
            });
        });
    }
}
