import { default as app } from './app';
import { NagBot } from './nagbot';
import * as restify from 'restify';
import { Storage, BotFrameworkAdapter, MemoryStorage, ActivityTypes, BotAdapter, CardFactory, ConversationReference, TurnContext, ConversationState, UserState, StatePropertyAccessor } from 'botbuilder';

interface BotInterface {
    onTurn(turnContent: TurnContext) : void;
};

export class SimpleBotService<Bot extends BotInterface> {
    public bot: Bot;
    public storage: Storage;
    public adapter: BotFrameworkAdapter;
    public httpServer: restify.Server;

    constructor(botConstructor: { new(store : Storage): Bot }, appId: string, appPassword : string, port: string | number) {
        this.storage = new MemoryStorage();

        this.adapter = new BotFrameworkAdapter({ appId: app.appId, appPassword: app.appPassword });

        // Catch-all for errors.
        this.adapter.onTurnError = async (turnContext, error) => {
            console.error(`\n[botOnTurnError]: ${error}`);
            await turnContext.sendActivity(`Oops. Something went wrong!`);
        };
        try {
            this.bot = new botConstructor(this.storage);
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

