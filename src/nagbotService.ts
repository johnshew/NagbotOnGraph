import * as restify from 'restify';
import { BotAdapter, BotFrameworkAdapter, ConversationReference, MemoryStorage, Storage, TurnContext } from 'botbuilder';
import { MicrosoftAppCredentials } from 'botframework-connector';

import { NagBot } from './nagbot';
import { ConversationManager } from './conversations';

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
            console.error(`[botInitializationError]: ${err}`);
            process.exit();
        }

        // Create bot HTTP server
        this.httpServer = restify.createServer();
        this.httpServer.name = 'BotServer';
        this.httpServer.listen(port, () => {
            console.log(`${this.httpServer.name} listening to ${this.httpServer.url}`);
        });

        this.httpServer.post('/api/messages', async (req, res) => {
            await this.adapter.processActivity(req, res, async (turnContext) => {
                await this.bot.onTurn(turnContext);
            });
        });
    }

    async processActivityInConversation(conversation: Partial<ConversationReference>, logic: (turnContext: TurnContext) => Promise<any>) {
        try {
            MicrosoftAppCredentials.trustServiceUrl(conversation.serviceUrl);
            await this.adapter.continueConversation(conversation, async (turnContext) => {
                return await logic(turnContext);
            });
        } catch (err) {
            console.log('problem running activity in conversation.');
            // throw err;
        }
    }

    async asyncClose(callback?: () => {}): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.httpServer.close(() => {
                console.log('Closed nagbotService');
                if (callback) callback();
                return resolve();
            })
        });
    }
}
