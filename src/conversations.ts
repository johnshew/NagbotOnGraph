import { ConversationReference } from 'botbuilder';
import { EventEmitter } from 'events';


export class ConversationManager extends EventEmitter {

    private conversationsByUser = new Map<string, Partial<ConversationReference>[]>(); // all known conversations associated with a user (oid) 
    private conversationsByTempKey = new Map<string, Partial<ConversationReference>>();  // all conversations not associated with a user (oid) indexed by their tempKey

    constructor() { super(); }

    findAllConversations(oid: string): Partial<ConversationReference>[] {
        let conversations = this.conversationsByUser.get(oid);
        return conversations || [];
    }

    trackConversationByTempKey(tempKey: string, conversation: Partial<ConversationReference>) {
        if (!tempKey) throw 'tempKey can not be null';
        this.conversationsByTempKey.set(tempKey, conversation);
    }

    setOidForConversation(tempKey: string, oid: string) {
        let conversation = this.conversationsByTempKey.get(tempKey);
        this.conversationsByTempKey.delete(tempKey);
        this.addConversationsByUser(oid, conversation);
        return conversation;

    }

    addConversationsByUser(oid: string, conversation: Partial<ConversationReference>, emit = true) {
        if (!oid) throw 'oid cannot be null';
        let conversations = this.conversationsByUser.get(oid);
        if (!conversations) {
            conversations = [];
            this.conversationsByUser.set(oid, conversations);
        }
        conversations.push(conversation);
        if (emit) this.emit('updated', oid, conversation);
    }

    load(oid: string, conversations: Partial<ConversationReference>[]) {
        this.conversationsByUser.set(oid, conversations);
    }

}

export declare interface ConversationManager {
    on(event: 'updated', listener: (oid: string, conversation: Partial<ConversationReference>) => void): this;
    emit(event: 'updated', oid: string, conversation: Partial<ConversationReference>): boolean
    // on(event: string, listener: Function): this;
    // emit(event: string | symbol, ...args : any[]) : boolean;
}



/* export class ConversationManager extends EventEmitter {

    private conversationsByUser = new Map<string, Map<string, Partial<ConversationReference>>>(); // all known conversations associated with a user (oid) also indexed by conversationId for camparison
    private conversationsByTempKey = new Map<string, Partial<ConversationReference>>();  // all conversations not associated with a user (oid) indexed by their tempKey

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

    updateConversationsByUser(oid: string, conversation: Partial<ConversationReference>, emit = true) {
        if (!oid) throw 'oid cannot be null';
        let conversations = this.conversationsByUser.get(oid);
        if (!conversations) {
            conversations = new Map<string, Partial<ConversationReference>>();
            this.conversationsByUser.set(oid, conversations);
        }
        conversations.set(conversation.conversation.id, conversation);
        if (emit) this.emit('updated', oid, conversation);
    }

}

export declare interface ConversationManager {
    on(event: 'updated', listener: (oid: string, conversation: Partial<ConversationReference>) => void): this;
    emit(event: 'updated', oid: string, conversation: Partial<ConversationReference>): boolean
    // on(event: string, listener: Function): this;
    // emit(event: string | symbol, ...args : any[]) : boolean;
}
 */