// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { default as app } from './app';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import { Storage, ActivityTypes, BotAdapter, CardFactory, ConversationReference, TurnContext, ConversationState, UserState, StatePropertyAccessor } from 'botbuilder';
import { randomBytes } from 'crypto';
import { stringify } from 'querystring';



/**
 * A simple bot that responds to utterances with answers from the Language Understanding (LUIS) service.
 * If an answer is not found for an utterance, the bot responds with help.
 */


export interface UserTracker {
    oid?: string;
    authKey?: string;
}

export interface ConversationTracker {
    adapter: BotAdapter;
    reference: Partial<ConversationReference>;
    oid?: string // from Oauth - uniquely identifies this user - and is used to find conversations.
    expiresOn?: Date;
}


export interface ConversationManagerOptions {
    save: (conversationId: string) => Promise<void>;


}
/* 

The conversation manager maintains two systems... depending on whether or not it has an autheticated user.

If the user is authenticated then given an oid the conversation manager can get the userAuthKey and then use the 

*/

export class ConversationManager {

    // Need to expire things.  Today this just grows.

    private conversationsByUser = new Map<string, Map<string,Partial<ConversationReference>>>(); // all known conversations associated with a user as identified by their Auth2 oid.
    private conversationsByTempKey = new Map<string, Partial<ConversationReference>>();    

    constructor() { }

    findAllConversations(oid: string): Partial<ConversationReference>[] {
        let conversations = this.conversationsByUser.get(oid);
        return (conversations) ? [... conversations.values() ] : [];
    }

    updateConversationsByUser(oid : string, conversation : Partial<ConversationReference>) {
        if (!oid)  throw 'oid cannot be null'
        let conversations = this.conversationsByUser.get(oid) || new Map<string, Partial<ConversationReference>>();
        conversations.set(conversation.conversation.id, conversation);
    }

    updateConversationByTempKey(tempKey: string, conversation : Partial<ConversationReference>) {
        if (!tempKey) throw 'tempKey can not be null';
        this.conversationsByTempKey.set(tempKey, conversation);
    }

    setOidForConversation(tempKey: string, oid : string) {
        let conversation = this.conversationsByTempKey.get(tempKey);
        this.conversationsByTempKey.delete(tempKey);
        this.updateConversationsByUser(oid, conversation);
        return conversation;
        
    }
    
    async processActivityInConversation(adapter : BotAdapter, conversation: Partial<ConversationReference>, logic: (turnContext: TurnContext) => Promise<any>) {
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

class ConversationStatus 
{
    oid : string = null;
    tempVerficationKey : string = null;
}


export interface NagBotConfig {
    store : Storage;
    conversationManager : ConversationManager;
}

export class NagBot {
    private userState: UserState;
    private userAccessor: StatePropertyAccessor<UserTracker>;
    private conversationState: ConversationState;
    private conversationAccessor: StatePropertyAccessor<ConversationStatus>;
    
    private store : Storage;
    private conversationManager : ConversationManager;
    constructor(config : NagBotConfig) {
        if (!config || !config.store || !config.conversationManager ) throw 'Missing config members needed for NagBot constructor';
        this.store = config.store;
        this.conversationManager = config.conversationManager;

        this.conversationState = new ConversationState(this.store);
        this.userState = new UserState(this.store);

        // Create the state property accessors for the conversation data and user profile.
        this.conversationAccessor = this.conversationState.createProperty<ConversationStatus>('conversationData');
        this.userAccessor = this.userState.createProperty<UserTracker>('userData');
    }

    // The following two maps duplicate bot state in memory - current bot state primitives don't enable iteration to find the data.  
    // Instead of duplicating the entire tracker we could store a key to adapter/conversationReference that would enable the creation of turnContext which could then be used get/set the data.
    // Perhaps a better alternative is to add this key mapping to a wrapper around any given storage object - so access stores the mapping.
    // Keeping it simple for now and just duplicating.

/*
    private mapOfTempUserConversationKeytoConversation = new Map<string, ConversationTracker>();  // only one of these per magic connection.  Ephemeral
    private mapOfUserOidToConversations = new Map<string, Set<ConversationTracker>>(); // all known conversations associated with a user as identified by their Auth2 oid.
*/

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
                        // await this.prepConversationForLogin(conversation);
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

/*

    async processActivityInConversation(conversation: ConversationTracker, logic: (turnContext: TurnContext) => Promise<any>) {
        try {
            await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                return await logic(turnContext);
            });
        } catch (err) {
            console.log('problem running activity in conversation.');
            throw err;
        }
    }

    async storeConversation(conversation: ConversationState) {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                    await this.conversationAccessor.set(turnContext, conversation);
                    return resolve(await this.conversationState.saveChanges(turnContext));
                });
            } catch (err) {
                reject("Couldn't write state for converation");
            }
        });
    }

    async convertTempUserConversationKeyToUser(userConversationKey: string, userOid: string, authManagerUserKey: string): Promise<ConversationTracker | undefined> {
        let conversation = this.mapOfTempUserConversationKeytoConversation.get(userConversationKey);
        if (conversation) {
            // Remove ephemeral UserConversationKey to conversation from Map.
            this.mapOfTempUserConversationKeytoConversation.delete(userConversationKey);  // no longer used

            // Update conversation state
            delete conversation.tempUserConversationKey;
            conversation.userOid = userOid;
            conversation.userAuthKey = authManagerUserKey;
            // !To Do - where to handle verification

            // Store the conversation in the Oid Set.
            this.addConversationToOidSet(userOid, conversation);

            await this.storeConversation(conversation);

            // Store the updated user
            await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                let userData = await this.userAccessor.get(turnContext, {});
                userData.oid = conversation.userOid;
                userData.authKey = conversation.userAuthKey;
                await this.userAccessor.set(turnContext, userData);
                await this.userState.saveChanges(turnContext);
            });
            return conversation;
        }
        return undefined;
    }

    private addConversationToOidSet(oid: string, conversation: ConversationTracker) {
        // force conversation to contain the oid.
        conversation.userOid = oid;
        let conversations = this.mapOfUserOidToConversations.get(oid);
        if (!conversations) { conversations = new Set<ConversationTracker>(); }
        conversations.add(conversation);
        this.mapOfUserOidToConversations.set(oid, conversations);
    }

    private async prepConversationForLogin(conversation: ConversationTracker) {
        if (conversation && conversation.userOid && conversation.userAuthKey) throw 'bad convesation in login prep';
        let userConversationKey = generateSecretKey(8);
        conversation.tempUserConversationKey = userConversationKey,
            this.mapOfTempUserConversationKeytoConversation.set(conversation.tempUserConversationKey, conversation);
    }
    */
}

function generateSecretKey(length: number = 16): string {
    let buf = randomBytes(length);
    return buf.toString('hex');
}

function guid() { return generateSecretKey(32); }
