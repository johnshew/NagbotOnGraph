import { AuthContext } from './simpleAuth';
import { EventEmitter } from 'events';
import { emit } from 'cluster';

export interface User {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens?: AuthContext;
    email?: string;
};

export class Users  {
    private data = new Map<string, User>();
    updateParentHook : (oid : string, user: User) => Promise<void> = null;

    get(oid: string) { return this.data.get(oid); }

    async set(oid: string, user: User) {
        this.data.set(oid, user);
        if (this.updateParentHook) return this.updateParentHook(oid, user);
        return;
    }

    foreach(callback: (value: User, key: string, map: Users) => void, thisArg?: any): void {
        this.data.forEach((u, k, m) => { callback(u, k, this); }, thisArg);
    }

    [Symbol.iterator](): IterableIterator<[string, User]> {
        let iterator: IterableIterator<[string, User]> = this.data.entries();
        return iterator;
    }

    async close(callback?: () => any): Promise<void> {
        return Promise.resolve();
    }

}
