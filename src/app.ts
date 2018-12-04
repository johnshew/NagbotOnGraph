import * as httpServer from './httpServer';
import * as simpleAuth from './simpleAuth';
import * as restify from 'restify'
import * as graphHelper from './graphHelper';
import { NagBot } from './nagbot';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { BotFrameworkAdapter, MemoryStorage, ConversationState, UserState } from 'botbuilder';


const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
var appId = process.env.appId;
var appPassword = process.env.appPassword;
if (!appId || !appPassword) { throw new Error('No app credentials.'); process.exit(); }

var httpServerUrl = 'http://localhost:8080';
var authUri = httpServerUrl + '/auth';
var authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.Read', 'User.ReadWrite'];

export class AppConfig {
    appId = appId;
    appPassword = appPassword;
    authUri = authUri;
    authDefaultScopes = authDefaultScopes;
    users = new Set<any>();
    authManager?: simpleAuth.AuthManager;
    graphHelper?: graphHelper.GraphHelper;
    httpServer?: httpServer.Server;
    bot?: NagBot;
}

let app = new AppConfig();

export default app;

app.authManager = new simpleAuth.AuthManager(app.appId, app.appPassword, app.authUri, app.authDefaultScopes);
app.graphHelper = new graphHelper.GraphHelper();
app.authManager.on('refreshed', () => console.log('refreshed'))


const adapter = new BotFrameworkAdapter({ appId: app.appId, appPassword: app.appPassword });

// Catch-all for errors.
adapter.onTurnError = async (turnContext, error) => {
    console.error(`\n[botOnTurnError]: ${error}`);
    await turnContext.sendActivity(`Oops. Something went wrong!`);
};

const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);
const userState = new UserState(memoryStorage);

let bot: NagBot;
try {
    bot = new NagBot(conversationState, userState);
} catch (err) {
    console.error(`[botInitializationError]: ${err}`);
    process.exit();
}
app.bot = bot;


// Create bot HTTP server
let botServer = restify.createServer();
botServer.name = 'BotServer';
botServer.listen(process.env.port || process.env.PORT || 3978,  () => {
    console.log(`\n${botServer.name} listening to ${botServer.url}`);
});

botServer.post('/api/messages', async (req, res) => {
    await adapter.processActivity(req, res, async (turnContext) => {
        await bot.onTurn(turnContext);
    });
});


app.httpServer = new httpServer.Server();

