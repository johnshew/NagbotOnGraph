import { BotAdapter, ConversationReference, TurnContext } from 'botbuilder';
import { EventEmitter } from 'events';
import { MicrosoftAppCredentials } from 'botframework-connector';

/**
 * A simple bot that responds to utterances with answers from the Language Understanding (LUIS) service.
 * If an answer is not found for an utterance, the bot responds with help.
 */

/* 

The conversation manager maintains two systems... depending on whether or not it has an autheticated user.

If the user is authenticated then given an oid the conversation manager can get the userAuthKey and then use the 

*/

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
        this.conversationsByUser.set(oid,conversations);
        this.emit('updated',oid, conversation);
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
    on(event: 'updated', listener: (oid : string, conversation : Partial<ConversationReference>) => void): this;
    emit(event: 'updated', oid : string, conversation: Partial<ConversationReference>): boolean
    // on(event: string, listener: Function): this;
    // emit(event: string | symbol, ...args : any[]) : boolean;
}
