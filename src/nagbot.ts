// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { default as app } from './app';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import { Storage, ActivityTypes, BotAdapter, CardFactory, ConversationReference, TurnContext, ConversationState, UserState, StatePropertyAccessor } from 'botbuilder';
import { randomBytes } from 'crypto';

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
    tempUserConversationKey?: string // locally generated for purposes of verifying no "man in the middle" on the bot.
    verified?: boolean;
    tempVerificationKey?: string // locally generated and ephemeral - not used yet
    userOid?: string // from Oauth - uniquely identifies this user - and is used to find conversations.
    userAuthKey?: string;  // authManger secret key ( can be shared with client over a secure channel )
    expiresOn?: Date;
}



export class NagBot {
    private conversationState: ConversationState;
    private userState: UserState;

    constructor(private store: Storage) {
        this.conversationState = new ConversationState(store);
        this.userState = new UserState(store);

        // Create the state property accessors for the conversation data and user profile.
        this.conversationAccessor = this.conversationState.createProperty<ConversationTracker>('conversationData');
        this.userAccessor = this.userState.createProperty<UserTracker>('userData');
    }

    private conversationAccessor: StatePropertyAccessor<ConversationTracker>;
    private userAccessor: StatePropertyAccessor<UserTracker>;
    // The following two maps duplicate bot state in memory - current bot state primitives don't enable iteration to find the data.  
    // Instead of duplicating the entire tracker we could store a key to adapter/conversationReference that would enable the creation of turnContext which could then be used get/set the data.
    // Perhaps a better alternative is to add this key mapping to a wrapper around any given storage object - so access stores the mapping.
    // Keeping it simple for now and just duplicating.
    private mapOfTempUserConversationKeytoConversation = new Map<string, ConversationTracker>();  // only one of these per magic connection.  Ephemeral
    private mapOfUserOidToConversations = new Map<string, Set<ConversationTracker>>(); // all known conversations associated with a user as identified by their Auth2 oid.

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
        let conversation = await this.conversationAccessor.get(turnContext);
        if (!conversation) { conversation = { adapter: adapter, reference: TurnContext.getConversationReference(turnContext.activity) } }

        switch (turnContext.activity.type) {
            case ActivityTypes.Message:
                switch (activity.text.toLowerCase().trim()) {
                    case 'login':
                        let oauthCardAttachment = CardFactory.oauthCard("AAD-OAUTH", 'title', 'text');
                        console.log(`Attachment: ${JSON.stringify(oauthCardAttachment)}`);
                        await turnContext.sendActivity({ attachments: [oauthCardAttachment] });
                        return;
                    case 'signin':
                        if (conversation && conversation.userOid && conversation.userAuthKey) {
                            await turnContext.sendActivity('You are already signed in');
                            return;
                        }
                        await this.prepConversationForLogin(conversation);
                        await this.storeConversation(conversation);
                        let signinCardAttachment = CardFactory.signinCard('title', `${app.botLoginUrl}?conversationKey=${conversation.tempUserConversationKey}`, 'text on the card');
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

    findAllConversations(oid: string): ConversationTracker[] {
        let conversations = this.mapOfUserOidToConversations.get(oid);
        return (conversations) ? Array.from(conversations) : [];
    }

    async processActivityInConversation(conversation: ConversationTracker, logic: (turnContext : TurnContext) => Promise<any>) {
        try {
            await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                return await logic(turnContext);
            });
        } catch (err) {
            console.log('problem running activity in conversation.');
            throw err;
        }
    }

    async storeConversation(conversation: ConversationTracker) {
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

}


async function sleep(milliseconds : number) {
    return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}


function generateSecretKey(length: number = 16): string {
    let buf = randomBytes(length);
    return buf.toString('hex');
}
