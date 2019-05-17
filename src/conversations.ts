import { ConversationReference } from 'botbuilder';
import { EventEmitter } from 'events';

export interface IConversation extends Partial<ConversationReference> {
    nagEnabled?: boolean;
}

export class ConversationManager extends EventEmitter {

    private conversationsByUser = new Map<string, IConversation[]>(); // all known conversations associated with a user (oid)
    private unauthenticatedConversationsByTempKey = new Map<string, IConversation>();  // all conversations not associated with a user (oid) indexed by their tempKey

    constructor() { super(); }

    public findAll(oid: string): IConversation[] {
        const conversations = this.conversationsByUser.get(oid);
        return conversations || [];
    }

    public find(oid: string, predicate: (value: IConversation, index: number, obj: IConversation[]) => boolean) {
        const conversations = this.conversationsByUser.get(oid);
        return conversations.find(predicate);
    }

    public initializeConversations(oid: string) {
        const conversations = [] as IConversation[];
        this.conversationsByUser.set(oid, conversations);
        return conversations;
    }

    public upsert(oid: string, conversation: IConversation) {
        if (!oid) { throw new Error('oid cannot be null'); }
        let conversations = this.conversationsByUser.get(oid);
        if (!conversations) { conversations = this.initializeConversations(oid); }
        const index = conversations.findIndex((x) => compare(x, conversation));
        if (index < 0) { conversations.push(conversation); } else {
            const result = { nagEnabled: true, ...conversations[index], ...conversation };
            conversations[index] = result;
        }
        this.conversationsByUser.set(oid, conversations);
        this.emit('updated', oid, conversation, this);
        return;
    }

    public delete(oid: string, conversation: IConversation) {
        if (!oid) { throw new Error('oid cannot be null'); }
        let conversations = this.conversationsByUser.get(oid);
        if (!conversations) { return; } // doesn't exist so consider it deleted
        conversations = conversations.filter((item) => !compare(item, conversation));
        this.conversationsByUser.set(oid, conversations);
        this.emit('updated', oid, conversation, this);
        return;
    }

    public load(oid: string, conversations: IConversation[]) {
        this.conversationsByUser.set(oid, conversations); // does not fire updated events
    }

    public clear(oid: string) {
        this.conversationsByUser.clear();
        this.emit('updated', oid, null, this);
    }

    public addUnauthenticatedConversation(tempKey: string, conversation: IConversation) {
        if (!tempKey) { throw new Error('tempKey can not be null'); }
        this.unauthenticatedConversationsByTempKey.set(tempKey, conversation);
    }

    public setOidForUnauthenticatedConversation(tempKey: string, oid: string) {
        const conversation = this.unauthenticatedConversationsByTempKey.get(tempKey);
        this.unauthenticatedConversationsByTempKey.delete(tempKey);
        this.upsert(oid, conversation);
        return conversation;
    }

}

/* tslint:disable:interface-name */
export declare interface ConversationManager {
    on(event: 'updated', listener: (oid: string, conversation: IConversation, thisArg: ConversationManager) => void): this;
    emit(event: 'updated', oid: string, conversation: IConversation, thisArg: ConversationManager): boolean;
}

export function compare(l: IConversation, r: IConversation): boolean {
    const result = (l.serviceUrl === r.serviceUrl) && (l.channelId === r.channelId) && (l.conversation.id === r.conversation.id);
    return result;
}
