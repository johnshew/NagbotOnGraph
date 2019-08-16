import { Collection, MongoClient } from 'mongodb';
import { app } from './nagbotApp';
import { User, Users } from './users';
import { logger } from './utils';

export class UsersMongo extends Users {

    public mongoClient: MongoClient;
    public mongoCollection: Collection<User>;
    public readonly ready: Promise<UsersMongo>;

    constructor(mongoConnection: string) {
        super();
        this.ready = new Promise<UsersMongo>(async (resolve, reject) => {
            MongoClient.connect(mongoConnection, { useNewUrlParser: true, useUnifiedTopology: true  }, async (err, client) => {
                try {
                    if (err) { console.log(`Error: ${err}`); return; }
                    console.log(logger`mongo connected`);
                    this.mongoClient = client;
                    const db = this.mongoClient.db('Test');
                    this.mongoCollection = db.collection<User>('users');
                    const users = await this.mongoCollection.find().toArray();
                    console.log(logger`loaded users count ${users.length}`);
                    for (const user of users) {
                        try {
                            this.set(user.oid, user);
                            const authContext = await app.authManager.loadAuthContext(user.authTokens);
                            const accessToken = await app.authManager.getAccessToken(authContext);
                            const conversationsData = await app.graph.getConversations(accessToken);
                            app.conversationManager.load(user.oid, conversationsData);
                            const conversations = app.conversationManager.findAll(user.oid);
                            for (const converation of conversations) {
                                await app.botService.processActivityInConversation(converation, async (turnContext) => {
                                    await app.botService.bot.setUser(turnContext, user);
                                });
                            }
                        } catch (err) {
                            console.log(logger`load failed for user ${user.preferredName} with ${err}`);
                        }
                    }

                    // don't hook until after loaded.
                    this.updateParentHook = async (oid, user) => {
                        const op = await this.mongoCollection.updateOne({ oid }, { $set: user }, { upsert: true });
                        console.log(op.result.ok === 1 ? 'stored user' : 'write failure');
                    };
                    return resolve(this);
                } catch (err) {
                    console.log(logger`mongo user load failed with ${err}`);
                    reject(err);
                }
            });
        });
    }

    public async close(callback?: () => any): Promise<void> {
        return new Promise(async (resolve, reject) => {
            this.mongoClient.close(() => {
                resolve();
            });
        });
    }
}
