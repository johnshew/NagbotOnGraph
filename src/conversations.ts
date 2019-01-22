import { BotAdapter, ConversationReference, TurnContext } from 'botbuilder';
import { EventEmitter } from 'events';
import { MicrosoftAppCredentials } from 'botframework-connector';
import { Timestamp, Collection, FilterQuery, ObjectId } from 'mongodb';



export interface Conversation extends Partial<ConversationReference> {
    _id?: ObjectId; // mongoId
    _lastUpdate?: Timestamp;
    _deleted?: boolean;
    oid: string;
}


export class ConversationManager extends EventEmitter {

    // Need to expire things.  Today this just grows.

    private conversationsByUser = new Map<string, Map<string, Partial<ConversationReference>>>(); // all known conversations associated with a user (oid) also indexed by conversationId for camparison
    private conversationsByTempKey = new Map<string, Partial<ConversationReference>>();

    constructor() { super(); }

    findAllConversations(oid: string): Partial<ConversationReference>[] {
        let conversations = this.conversationsByUser.get(oid);
        return (conversations) ? [...conversations.values()] : [];
    }

    updateConversationByTempKey(tempKey: string, conversation: Partial<ConversationReference>) {
        if (!tempKey) throw 'tempKey can not be null';
        this.conversationsByTempKey.set(tempKey, conversation);
    }

    setOidForConversation(tempKey: string, oid: string) {
        let conversation = this.conversationsByTempKey.get(tempKey);
        this.conversationsByTempKey.delete(tempKey);
        this.updateConversationsByUser(oid, conversation);
        return conversation;

    }

    updateConversationsByUser(oid: string, conversation: Partial<ConversationReference>) {
        if (!oid) throw 'oid cannot be null'
        let conversations = this.conversationsByUser.get(oid) || new Map<string, Partial<ConversationReference>>();
        conversations.set(conversation.conversation.id, conversation);
        this.conversationsByUser.set(oid, conversations);
        this.emit('updated', oid, conversation);
    }

    async processActivityInConversation(adapter: BotAdapter, conversation: Partial<ConversationReference>, logic: (turnContext: TurnContext) => Promise<any>) {
        try {
            MicrosoftAppCredentials.trustServiceUrl(conversation.serviceUrl);
            await adapter.continueConversation(conversation, async (turnContext) => {
                return await logic(turnContext);
            });
        } catch (err) {
            console.log('problem running activity in conversation.');
            // throw err;
        }
    }
}

export declare interface ConversationManager {
    on(event: 'updated', listener: (oid: string, conversation: Partial<ConversationReference>) => void): this;
    emit(event: 'updated', oid: string, conversation: Partial<ConversationReference>): boolean
    // on(event: string, listener: Function): this;
    // emit(event: string | symbol, ...args : any[]) : boolean;
}


export class ConversationManager2 extends EventEmitter {

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
        }
        if (conversation._id) {
            let result = await this.collection.findOneAndUpdate({ _id: conversation._id }, values);
            if (result.ok != 1) { throw Error('Write failed')}
        } else {
            let result = await this.collection.insertOne(values);
            if (result.result.ok != 1) { throw Error('Write failed')}
            let updated = <Conversation> result.ops[0];
            conversation._id = updated._id;
            conversation._lastUpdate = updated._lastUpdate;
        }
    }
    constructor(private collection: Collection) { super(); }
}

export declare interface ConversationManager2 {
    on(event: 'updated', listener: (oid: string, conversation: Partial<ConversationReference>) => void): this;
    emit(event: 'updated', oid: string, conversation: Partial<ConversationReference>): boolean
    // on(event: string, listener: Function): this;
    // emit(event: string | symbol, ...args : any[]) : boolean;
}

function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
    const ret: any = {};
    keys.forEach(key => {
        ret[key] = obj[key];
    })
    return ret;
}

function exclude<T extends object, K extends keyof T>(obj: T, ...notKeys: K[]): Pick<T, Exclude<keyof T, K>> {
    let keys = <Exclude<keyof T, K>[]>Object.keys(obj).filter(k => !(k in notKeys))
    return pick(obj, ...keys);
}