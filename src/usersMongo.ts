import { Collection, MongoClient } from 'mongodb';

import { app, AppConfig } from './app';
import { User, Users } from './users';

export class UsersMongo extends Users {

    mongoClient: MongoClient;
    mongoCollection: Collection<User>;
    ready: Promise<UsersMongo>;

    constructor(mongoConnection: string) {
        super();
        this.ready = new Promise<UsersMongo>(async (resolve, reject) => {
            MongoClient.connect(mongoConnection, { useNewUrlParser: true }, async (err, client) => {
                if (err) { console.log(`Error: ${err}`); return; }
                console.log('mongo connected');
                this.mongoClient = client;
                let db = this.mongoClient.db('Test');
                this.mongoCollection = db.collection<User>('users');
                let users = await this.mongoCollection.find().toArray();
                console.log(`Loaded ${users.length} users.`);
                for (const user of users) {
                    this.data.set(user.oid, user);
                    await app.authManager.setAuthContext(user.authTokens);
                    let conversationsData = await app.graph.getConversations(user.oid);
                    app.conversationManager.load(user.oid, conversationsData);
                    let conversations = app.conversationManager.findAll(user.oid);
                    for (const converation of conversations) {
                        await app.botService.processActivityInConversation(converation, async (turnContext) => {
                            await app.botService.bot.setUser(turnContext, user);
                        });
                    }
                }
                return resolve(this);
            });
        });

        this.updateParentHook = async (oid, user) => {
            let op = await this.mongoCollection.updateOne({ "oid": oid }, { $set: user }, { upsert: true });
            // let op = await this.mongoCollection.updateOne({ "oid": oid }, user, { upsert: true });
            console.log(op.result.ok == 1 ? `stored user` : `write failure`);    
        };
    }

    async close(callback?: () => any): Promise<void> {
        return new Promise((resolve, reject) => {
            this.mongoClient.close(() => {
                resolve();
            })
        });
    }

}

