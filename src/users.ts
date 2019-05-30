import { emit } from 'cluster';
import { EventEmitter } from 'events';
import { AuthContext } from './simpleAuth';

/* tslint:disable:interface-name */
export interface User {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens?: AuthContext;
    email?: string;
}

export class Users  {
    public updateParentHook: (oid: string, user: User) => Promise<void> = null;
    private data = new Map<string, User>();

    public get(oid: string) { return this.data.get(oid); }

    public async set(oid: string, user: User) {
        this.data.set(oid, user);
        if (this.updateParentHook) { return this.updateParentHook(oid, user); }
        return;
    }

    public foreach(callback: (value: User, key: string, map: Users) => void, thisArg?: any): void {
        this.data.forEach((u, k, m) => { callback(u, k, this); }, thisArg);
    }

    public [Symbol.iterator](): IterableIterator<[string, User]> {
        const iterator: IterableIterator<[string, User]> = this.data.entries();
        return iterator;
    }

    public async close(callback?: () => any): Promise<void> {
        return Promise.resolve();
    }

}
