import { default as app } from './app';
import * as restify from 'restify';
import { Storage, BotFrameworkAdapter, MemoryStorage,  TurnContext } from 'botbuilder';
import { NagBot, ConversationManager } from './nagbot';

interface BotInterface {
    onTurn(turnContent: TurnContext) : void;
};

export class NagBotService {
    public bot: NagBot;
    public storage: Storage;
    public conversationManager : ConversationManager;
    public adapter: BotFrameworkAdapter;
    public httpServer: restify.Server;

    constructor(appId: string, appPassword : string, port: string | number) {
        this.storage = new MemoryStorage();
        this.conversationManager = new ConversationManager();
        
        this.adapter = new BotFrameworkAdapter({ appId: app.appId, appPassword: app.appPassword });

        // Catch-all for errors.
        this.adapter.onTurnError = async (turnContext, error) => {
            console.error(`\n[botOnTurnError]: ${error}`);
            await turnContext.sendActivity(`Oops. Something went wrong!`);
        };
        try {
            this.bot = new NagBot ({ store: this.storage, conversationManager : this.conversationManager});
        } catch (err) {
            console.error(`[botInitializationError]: ${err}`);
            process.exit();
        }

        // Create bot HTTP server
        this.httpServer = restify.createServer();
        this.httpServer.name = 'BotServer';
        this.httpServer.listen(port, () => {
            console.log(`\n${this.httpServer.name} listening to ${this.httpServer.url}`);
        });

        this.httpServer.post('/api/messages', async (req, res) => {
            await this.adapter.processActivity(req, res, async (turnContext) => {
                await this.bot.onTurn(turnContext);
            });
        });
    }
}

