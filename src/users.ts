import { AuthTokens } from './simpleAuth';
import { EventEmitter } from 'events';
import { emit } from 'cluster';

export interface User {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens?: AuthTokens;
};


/* export interface UsersMap {
    get(oid: string): User;
    set(oid: string, user : User): Promise<void>;
    foreach(callback: (value: User, key: string, map: Users) => void, thisArg?: any): void;
    [Symbol.iterator](): IterableIterator<[string, User]>;
    close(callback?: () => any): Promise<void>;
    on(event: 'updated', listener: (user: User) => void): this;
    emit(event: 'updated', user: User): boolean
}
 */
export class Users extends EventEmitter {
    data = new Map<string, User>();

    get(oid: string) { return this.data.get(oid); }

    async set(oid: string, user: User) {
        this.data.set(oid, user);
        emit('updated', oid, user);
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

export declare interface Users {
    on(event: 'updated', listener: (oid: string, user: User) => void): this;
    emit(event: 'updated', oid: string, user: User): boolean
}
