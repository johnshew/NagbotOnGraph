import { Collection } from 'mongodb';

import { app } from './app';
import { AuthTokens } from './simpleAuth';
import { UserStatus } from './nagbot';

export interface User extends UserStatus {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens?: AuthTokens;
};

export class UsersMap {
    data = new Map<string, User>();
    public ready : Promise<void>;

    constructor(private mongoCollection: Collection<User>) {
        this.ready = new Promise((resolve, reject) => {
            this.mongoCollection.find().toArray().then(async users => {
                console.log(`Loaded users: ${JSON.stringify(users, null, 2)}`);
                for (const user of users) {
                    this.data.set(user.oid, user);
                    app.authManager.setTokensForUserAuthKey(user.authTokens.auth_secret, user.authTokens);
                    let conversations = await app.graph.LoadConversations(user.oid);
                    for (const conversation of conversations) {
                        app.conversationManager.updateConversationsByUser(user.oid, conversation); //! TO FIX:  will do a write 
                    }
                }
                resolve();
            });
        });
    }

    get(oid: string) { return this.data.get(oid); }

    async set(oid: string, user: User) {
        this.data.set(oid, user);
        let op = await this.mongoCollection.update({ "oid": oid }, user, { upsert: true });
        console.log(op.result.ok == 1 ? `stored user` : `write failure`);
    }


    forEach(callback: (value: User, key: string, map: UsersMap) => void, thisArg?: any) {
        this.data.forEach((u, k, m) => { callback(u, k, this); }, thisArg);
    }

    [Symbol.iterator](): IterableIterator<[string, User]> {
        let iterator: IterableIterator<[string, User]> = this.data.entries();
        return iterator;
    }
}
