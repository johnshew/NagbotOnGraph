import { Collection, MongoClient } from 'mongodb';

import { app } from './app';
import { User, Users } from './users';

export class UsersMongo extends Users {
    
    mongoClient: MongoClient;
    mongoCollection: Collection<User>;
    ready : Promise<UsersMongo>;

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
                console.log(`Loaded users: ${JSON.stringify(users, null, 2)}`);
                for (const user of users) {
                    this.data.set(user.oid, user);
                    app.authManager.setTokensForUserAuthKey(user.authTokens.auth_secret, user.authTokens);
                    let conversations = await app.graph.loadConversations(user.oid);
                    app.conversationManager.load(user.oid, conversations);
                }
                return resolve(this);
            });
        });
    }

    async close(callback?: () => any): Promise<void> {
        return new Promise((resolve, reject) => {
            this.mongoClient.close(() => {
                resolve();
            })
        });
    }
}

