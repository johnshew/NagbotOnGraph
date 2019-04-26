import { Collection, MongoClient } from 'mongodb';
import { logger } from './utils';
import { app, AppConfig } from './app';
import { User, Users } from './users';

export class UsersMongo extends Users {

    mongoClient: MongoClient;
    mongoCollection: Collection<User>;
    readonly ready: Promise<UsersMongo>;

    constructor(mongoConnection: string) {
        super();
        this.ready = new Promise<UsersMongo>(async (resolve, reject) => {
            MongoClient.connect(mongoConnection, { useNewUrlParser: true }, async (err, client) => {
                try {
                    if (err) { console.log(`Error: ${err}`); return; }
                    console.log(logger`mongo connected`);
                    this.mongoClient = client;
                    let db = this.mongoClient.db('Test');
                    this.mongoCollection = db.collection<User>('users');
                    let users = await this.mongoCollection.find().toArray();
                    console.log(logger`loaded users count ${users.length}`);
                    for (const user of users) {
                        try {
                            this.set(user.oid, user);
                            await app.authManager.loadAuthContext(user.authTokens);
                            let conversationsData = await app.graph.getConversations(user.oid);
                            app.conversationManager.load(user.oid, conversationsData);
                            let conversations = app.conversationManager.findAll(user.oid);
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
                        let op = await this.mongoCollection.updateOne({ "oid": oid }, { $set: user }, { upsert: true });
                        console.log(op.result.ok == 1 ? `stored user` : `write failure`);
                    };
                    return resolve(this);
                } catch (err) {
                    console.log(logger`mongo user load failed with ${err}`);
                    reject(err);
                }
            })
        });
    }

    async close(callback?: () => any): Promise<void> {
        return new Promise(async (resolve, reject) => {
            this.mongoClient.close(() => {
                resolve();
            })
        });
    }
}

