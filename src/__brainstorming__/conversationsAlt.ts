// Brainstorming - if we wanted to put conversations in Mongo - they are currently in the microsoft graph.

import { EventEmitter } from 'events';
import { Collection, FilterQuery } from 'mongodb';
import { ConversationReference } from 'botbuilder';
import { Timestamp, ObjectId } from 'mongodb';

export interface Conversation extends Partial<ConversationReference> {
    _id?: ObjectId; // mongoId
    _lastUpdate?: Timestamp;
    _deleted?: boolean;
    oid: string;
}

export class Brainstorming_ConversationManager extends EventEmitter {
    private updateCache(conversations: any) { }
    public async findInCloud(filter: FilterQuery<Conversation>): Promise<Conversation[]> {
        filter._deleted = { '$ne': true };
        let result = await this.collection.find<Conversation>(filter);
        let conversations = await result.toArray();
        this.updateCache(conversations);
        return conversations;
    }
    public async findInCache(filter: (conversation: Conversation) => boolean): Promise<Conversation[]> {
        return [];
    }
    public async delete(conversation: Conversation) {
        let result = await this.collection.update({ _id: conversation._id }, {
            _deleted: true,
            $currentDate: { _lastUpdate: { $type: "timestamp" } },
        });
    }
    public async save(conversation: Conversation) {
        let values = {
            ...exclude(conversation, "_deleted", "_lastUpdate", "_id"),
            $currentDate: { _lastUpdate: { $type: "timestamp" } }
        };
        if (conversation._id) {
            let result = await this.collection.findOneAndUpdate({ _id: conversation._id }, values);
            if (result.ok != 1) {
                throw Error('Write failed');
            }
        }
        else {
            let result = await this.collection.insertOne(values);
            if (result.result.ok != 1) {
                throw Error('Write failed');
            }
            let updated = <Conversation>result.ops[0];
            conversation._id = updated._id;
            conversation._lastUpdate = updated._lastUpdate;
        }
    }
    constructor(private collection: Collection) { super(); }
}

export declare interface Brainstorming_ConversationManager {
    on(event: 'updated', listener: (oid: string, conversation: Partial<ConversationReference>) => void): this;
    emit(event: 'updated', oid: string, conversation: Partial<ConversationReference>): boolean
    // on(event: string, listener: Function): this;
    // emit(event: string | symbol, ...args : any[]) : boolean;
}


export function exclude<T extends object, K extends keyof T>(obj: T, ...notKeys: K[]): Pick<T, Exclude<keyof T, K>> {
    let keys = <Exclude<keyof T, K>[]>Object.keys(obj).filter(k => !(k in notKeys))
    return pick(obj, ...keys);
}


function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
    const ret: any = {};
    keys.forEach(key => {
        ret[key] = obj[key];
    })
    return ret;
}
