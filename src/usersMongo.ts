import { Collection, MongoClient } from 'mongodb';

import { app } from './app';
import { User } from './user';

export class UsersMongo {
    data = new Map<string, User>();
    mongoClient: MongoClient;
    mongoCollection: Collection<User>;
    public ready: Promise<UsersMongo>;

    constructor(mongoConnection: string) {
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
                    let conversations = await app.graph.LoadConversations(user.oid);
                    for (const conversation of conversations) {
                        app.conversationManager.updateConversationsByUser(user.oid, conversation, false); // Since loading don't emit updated event.
                    }
                }
                return resolve(this);
            });
        });
    }

    get(oid: string) { return this.data.get(oid); }

    async set(oid: string, user: User) {
        this.data.set(oid, user);
        let op = await this.mongoCollection.update({ "oid": oid }, user, { upsert: true });
        console.log(op.result.ok == 1 ? `stored user` : `write failure`);
    }


    forEach(callback: (value: User, key: string, map: UsersMongo) => void, thisArg?: any) {
        this.data.forEach((u, k, m) => { callback(u, k, this); }, thisArg);
    }

    [Symbol.iterator](): IterableIterator<[string, User]> {
        let iterator: IterableIterator<[string, User]> = this.data.entries();
        return iterator;
    }

    async close(callback? : () => any) : Promise<void> {
        return new Promise((resolve,reject) => {
            this.mongoClient.close(() => {
                resolve();
            })
        });
    }
}
