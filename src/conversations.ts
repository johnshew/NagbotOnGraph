import { ConversationReference } from "botbuilder";
import { EventEmitter } from "events";

export interface IConversation extends Partial<ConversationReference> {
    nagEnabled?: boolean
}

export class ConversationManager extends EventEmitter {

    private conversationsByUser = new Map<string, IConversation[]>(); // all known conversations associated with a user (oid) 
    private unauthenticatedConversationsByTempKey = new Map<string, IConversation>();  // all conversations not associated with a user (oid) indexed by their tempKey

    constructor() { super(); }

    findAll(oid: string): IConversation[] {
        let conversations = this.conversationsByUser.get(oid);
        return conversations || [];
    }

    find(oid: string, predicate: (value: IConversation, index: number, obj: IConversation[]) => boolean) {
        let conversations = this.conversationsByUser.get(oid);
        return conversations.find(predicate)
    }

    initializeConversations(oid: string) {
        let conversations = [] as IConversation[];
        this.conversationsByUser.set(oid, conversations);
        return conversations;
    }

    upsert(oid: string, conversation: IConversation) {
        if (!oid) throw 'oid cannot be null';
        let conversations = this.conversationsByUser.get(oid);
        if (!conversations) { conversations = this.initializeConversations(oid); }
        let index = conversations.findIndex((x) => compare(x, conversation));
        if (index < 0) { conversations.push(conversation); }
        else {
            let result = { nagEnabled: true, ...conversations[index], ...conversation };
            conversations[index] = result;
        }
        this.conversationsByUser.set(oid, conversations);
        this.emit('updated', oid, conversation, this);
        return;
    }

    delete(oid: string, conversation: IConversation) {
        if (!oid) throw 'oid cannot be null';
        let conversations = this.conversationsByUser.get(oid);
        if (!conversations) { return; } // doesn't exist so consider it deleted
        conversations = conversations.filter(item => !compare(item,conversation));
        this.conversationsByUser.set(oid, conversations);
        this.emit('updated', oid, conversation, this);
        return;
    }

    load(oid: string, conversations: IConversation[]) {
        this.conversationsByUser.set(oid, conversations); // does not fire updated events
    }

    clear(oid: string) {
        this.conversationsByUser.clear();
        this.emit("updated", oid, null, this);
    }

    addUnauthenticatedConversation(tempKey: string, conversation: IConversation) {
        if (!tempKey) throw 'tempKey can not be null';
        this.unauthenticatedConversationsByTempKey.set(tempKey, conversation);
    }

    setOidForUnauthenticatedConversation(tempKey: string, oid: string) {
        let conversation = this.unauthenticatedConversationsByTempKey.get(tempKey);
        this.unauthenticatedConversationsByTempKey.delete(tempKey);
        this.upsert(oid, conversation);
        return conversation;
    }

}

export declare interface ConversationManager {
    on(event: 'updated', listener: (oid: string, conversation: IConversation, thisArg: ConversationManager) => void): this;
    emit(event: 'updated', oid: string, conversation: IConversation, thisArg: ConversationManager): boolean
}

export function compare(l: IConversation, r: IConversation): boolean {
    let result = (l.serviceUrl === r.serviceUrl) && (l.channelId === r.channelId) && (l.conversation.id === r.conversation.id)
    return result;
}
