// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { default as app } from './app';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import { Storage, ActivityTypes, BotAdapter, CardFactory, ConversationReference, TurnContext, ConversationState, UserState, StatePropertyAccessor } from 'botbuilder';
import { randomBytes } from 'crypto';
import { stringify } from 'querystring';
import { EventEmitter } from 'events';
import { emit, on } from 'cluster';



/**
 * A simple bot that responds to utterances with answers from the Language Understanding (LUIS) service.
 * If an answer is not found for an utterance, the bot responds with help.
 */


export interface ConversationManagerOptions {
    save: (conversationId: string) => Promise<void>;


}
/* 

The conversation manager maintains two systems... depending on whether or not it has an autheticated user.

If the user is authenticated then given an oid the conversation manager can get the userAuthKey and then use the 

*/

export class ConversationManager extends EventEmitter {

    // Need to expire things.  Today this just grows.

    private conversationsByUser = new Map<string, Map<string, Partial<ConversationReference>>>(); // all known conversations associated with a user as identified by their Auth2 oid.
    private conversationsByTempKey = new Map<string, Partial<ConversationReference>>();

    constructor() { super(); }

    findAllConversations(oid: string): Partial<ConversationReference>[] {
        let conversations = this.conversationsByUser.get(oid);
        return (conversations) ? [...conversations.values()] : [];
    }

    updateConversationsByUser(oid: string, conversation: Partial<ConversationReference>) {
        if (!oid) throw 'oid cannot be null'
        let conversations = this.conversationsByUser.get(oid) || new Map<string, Partial<ConversationReference>>();
        conversations.set(conversation.conversation.id, conversation);
        this.emit('updated',oid, conversation);
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

    async processActivityInConversation(adapter: BotAdapter, conversation: Partial<ConversationReference>, logic: (turnContext: TurnContext) => Promise<any>) {
        try {
            await adapter.continueConversation(conversation, async (turnContext) => {
                return await logic(turnContext);
            });
        } catch (err) {
            console.log('problem running activity in conversation.');
            throw err;
        }
    }

}

export declare interface ConversationManager {
    on(event: 'updated', listener: (oid : string, conversation : Partial<ConversationReference>) => void): this;
    emit(event: 'updated', oid : string, conversation: Partial<ConversationReference>): boolean
    // on(event: string, listener: Function): this;
    // emit(event: string | symbol, ...args : any[]) : boolean;
}


export interface UserStatus {
    oid?: string;
    authKey?: string;
}


class ConversationStatus {
    oid: string = null;
    tempVerficationKey: string = null;
}

export interface NagBotConfig {
    store: Storage;
    conversationManager: ConversationManager;
}

export class NagBot {
    private userState: UserState;
    private userAccessor: StatePropertyAccessor<UserStatus>;
    private conversationState: ConversationState;
    private conversationAccessor: StatePropertyAccessor<ConversationStatus>;

    private store: Storage;
    private conversationManager: ConversationManager;

    constructor(config: NagBotConfig) {
        if (!config || !config.store || !config.conversationManager) throw 'Missing config members needed for NagBot constructor';
        this.store = config.store;
        this.conversationManager = config.conversationManager;

        this.conversationState = new ConversationState(this.store);
        this.userState = new UserState(this.store);

        // Create the state property accessors for the conversation data and user profile.
        this.conversationAccessor = this.conversationState.createProperty<ConversationStatus>('conversationData');
        this.userAccessor = this.userState.createProperty<UserStatus>('userData');
    }

    /**
     * Every conversation turn calls this method.
     * There are no dialogs used, since it's "single turn" processing, meaning a single request and
     * response, with no stateful conversation.
     * @param turnContext A TurnContext instance, containing all the data needed for processing the conversation turn.
     */


    async onTurn(turnContext: TurnContext) {
        // By checking the incoming Activity type, the bot only calls LUIS in appropriate cases.
        let adapter = turnContext.adapter;
        console.log(`onTurn: ${JSON.stringify(turnContext)}`);
        const activity = turnContext.activity;
        let user = await this.userAccessor.get(turnContext, {});
        let conversation = await this.conversationAccessor.get(turnContext) || new ConversationStatus();

        switch (turnContext.activity.type) {
            case ActivityTypes.Message:
                switch (activity.text.toLowerCase().trim()) {
                    case 'login':
                        let oauthCardAttachment = CardFactory.oauthCard("AAD-OAUTH", 'title', 'text');
                        console.log(`Attachment: ${JSON.stringify(oauthCardAttachment)}`);
                        await turnContext.sendActivity({ attachments: [oauthCardAttachment] });
                        return;
                    case 'signin':
                        if (conversation && conversation.oid) {
                            await turnContext.sendActivity('You are already signed in');
                            await turnContext.sendActivity('Logout to switch user');
                            return;
                        }
                        if (turnContext.activity.conversation.isGroup) {
                            await turnContext.sendActivity('No sign in currently allowed in group conversations');
                            return;
                        }

                        conversation.tempVerficationKey = generateSecretKey();
                        this.conversationManager.updateConversationByTempKey(conversation.tempVerficationKey, TurnContext.getConversationReference(activity));
                        // await this.conversationAccessor.set(turnContext, conversation);
                        // await this.conversationState.saveChanges(turnContext);

                        let signinCardAttachment = CardFactory.signinCard('Nagbot Login', `${app.botLoginUrl}?conversationKey=${conversation.tempVerficationKey}`, 'Click above to sign in.');
                        console.log(`Attachment: ${JSON.stringify(signinCardAttachment)}`);
                        await turnContext.sendActivity({ attachments: [signinCardAttachment] });
                        return;
                    default:
                        await turnContext.sendActivity(`Hello`);
                        return;
                }
                break;

            case ActivityTypes.ConversationUpdate:
                if (activity.recipient.id !== turnContext.activity.membersAdded[0].id) {
                    await turnContext.sendActivity('I am NagBot.  Welcome.');
                }
                break;

            case ActivityTypes.Event:
                if (activity.name && activity.name === "tokens/response" && activity.value.token) {
                    await turnContext.sendActivity('Got a token');
                    let token = activity.value.token;
                    let graphClient = GraphClient.init({
                        authProvider: (done) => {
                            done(null, token); // First parameter takes an error if you can't get an access token.
                        }
                    });
                    let result = await graphClient.api('/me').get();
                    await turnContext.sendActivity(`Result: ${JSON.stringify(result)}`);
                }
                break;

            default:
                await turnContext.sendActivity(`[${turnContext.activity.type}]-type activity detected.`);
                break;
        }
    }
}

function generateSecretKey(length: number = 16): string {
    let buf = randomBytes(length);
    return buf.toString('hex');
}

function guid() { return generateSecretKey(32); }
