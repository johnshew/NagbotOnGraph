import { ConversationReference } from 'botbuilder';
import { EventEmitter } from 'events';
import { emit } from 'cluster';

export class ConversationManager extends EventEmitter {

    private conversationsByUser = new Map<string, Partial<ConversationReference>[]>(); // all known conversations associated with a user (oid) 
    private unauthenticatedConversationsByTempKey = new Map<string, Partial<ConversationReference>>();  // all conversations not associated with a user (oid) indexed by their tempKey

    constructor() { super(); }

    findAll(oid: string): Partial<ConversationReference>[] {
        let conversations = this.conversationsByUser.get(oid);
        return conversations || [];
    }

    find(oid: string, predicate: (value: Partial<ConversationReference>, index: number, obj: Partial<ConversationReference>[]) => boolean ) {
        let conversations = this.conversationsByUser.get(oid);
        return conversations.find(predicate)
    }

    insert(oid: string, conversation: Partial<ConversationReference>) {
        if (!oid) throw 'oid cannot be null';
        let conversations = this.conversationsByUser.get(oid);
        if (!conversations) {
            conversations = [];
            this.conversationsByUser.set(oid, conversations);
        }
        let exists = conversations.find((x) => compare(x,conversation));
        if (exists) throw "currently not supporting updates"
        conversations.push(conversation);
        this.emit('updated', oid, conversation, this);
    }

    load(oid: string, conversations: Partial<ConversationReference>[]) {
        this.conversationsByUser.set(oid, conversations); // does not fire updated events
    }

    clear(oid: string) {
        this.conversationsByUser.clear();
        this.emit("updated", oid, null, this);
    }

    addUnauthenticatedConversation(tempKey: string, conversation: Partial<ConversationReference>) {
        if (!tempKey) throw 'tempKey can not be null';
        this.unauthenticatedConversationsByTempKey.set(tempKey, conversation);
    }

    setOidForUnauthenticatedConversation(tempKey: string, oid: string) {
        let conversation = this.unauthenticatedConversationsByTempKey.get(tempKey);
        this.unauthenticatedConversationsByTempKey.delete(tempKey);
        this.insert(oid, conversation);
        return conversation;
    }

}

export declare interface ConversationManager {
    on(event: 'updated', listener: (oid: string, conversation: Partial<ConversationReference>, thisArg: ConversationManager) => void): this;
    emit(event: 'updated', oid: string, conversation: Partial<ConversationReference>, thisArg: ConversationManager): boolean
}

export function compare(l : Partial<ConversationReference>, r :Partial<ConversationReference> ) : boolean {
    let result = (l.serviceUrl === r.serviceUrl) && (l.channelId === r.channelId) && (l.conversation.id === r.conversation.tenantId)
    return result;
}
