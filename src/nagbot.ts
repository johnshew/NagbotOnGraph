// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import { ActivityTypes, BotFrameworkAdapter, CardFactory, ConversationReference, TurnContext, ConversationState, UserState, StatePropertyAccessor } from 'botbuilder';
import { randomBytes } from 'crypto';
import { stringify } from 'querystring';
import { isPrimitive } from 'util';


/**
 * A simple bot that responds to utterances with answers from the Language Understanding (LUIS) service.
 * If an answer is not found for an utterance, the bot responds with help.
 */

async function sleep(milliseconds) {
    return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}


class ConversationTracker {
    adapter: BotFrameworkAdapter;
    reference: Partial<ConversationReference>;
    userConversationKey?: string // locally generated for purposes of verifying no "man in the middle" on the bot.
    verified?: boolean;
    verificationKey?: string // locally generated and ephemeral - not used yet
    userOid?: string // from Oauth - uniquely identifies this user - and is used to find conversations.
    userAuthKey?: string;  // authManger secret key ( can be shared with client over a secure channel )
    expiresOn?: Date;
}

class UserTracker {
    userOid?: string;
}

export function generateSecretKey(length: number = 48): string {
    let buf = randomBytes(length);
    return buf.toString('hex');
}

export class NagBot {


    constructor(private conversationState: ConversationState, private userState: UserState) {
        // Create the state property accessors for the conversation data and user profile.
        this.conversationAccessor = this.conversationState.createProperty<ConversationTracker>('conversationData');
        this.userAccessor = this.userState.createProperty<UserTracker>('userData');
    }

    private conversationAccessor: StatePropertyAccessor<ConversationTracker>;
    private userAccessor: StatePropertyAccessor<UserTracker>;
    // The following two maps duplicate bot state in memory - current bot state primitives don't enable iteration to find the data.  
    // Instead of duplicating the entire tracker we could store a key to adapter/conversationReference that would enable the creation of turnContext which could then be used get/set the data.
    // Perhaps a better alternative is to add this key mapping is a key mapping wrapper around any given storage object includes storing the mapping.
    // Keeping it simple for now and just duplicating.
    private mapOfUserConversationKeytoConversation = new Map<string, ConversationTracker>();  // only one of these per magic connection.  Ephemeral
    private mapOfUserOidToConversations = new Map<string, Set<ConversationTracker>>(); // all known conversations associated with a user as identified by their Auth2 oid.

    /**
     * Every conversation turn calls this method.
     * There are no dialogs used, since it's "single turn" processing, meaning a single request and
     * response, with no stateful conversation.
     * @param turnContext A TurnContext instance, containing all the data needed for processing the conversation turn.
     */

    private async processActivityForUserOnce(userOid: string, logic: (TurnContext) => Promise<any>) {
        let conversations = this.mapOfUserOidToConversations.get(userOid);
        let conversation = (conversations && conversations.size > 0) ? conversations.values().next().value : undefined;
        if (conversation.adapter && conversation.reference) {
            await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                return await logic(turnContext);
            });
        }
        else return Promise.reject("Couldn't continue converation");
    }

    private async processActivityForUser(userOid: string, logic: (TurnContext) => Promise<any>) {
        let updates = null;
        try {
            updates = this.findAllConversations(userOid).map(async c => {
                if (c.adapter && c.reference) {
                    await c.adapter.continueConversation(c.reference, async (turnContext) => {
                        return logic(turnContext); // not awaiting yet
                    });
                }
            });
        }
        catch (err) {
            throw 'Unable to processAcvitityForUser' + err;
        }
        return await Promise.all(updates);
    }

    async processActivityInConversation(conversation: ConversationTracker, logic: (TurnContext) => Promise<any>) {
        await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
            return logic(turnContext); // not awaiting yet
        })
        .catch(err => { throw err; });
    }


    private addConversationToOidSet(oid: string, conversation: ConversationTracker) {
        // force conversation to contain the oid.
        conversation.userOid = oid;
        let conversations = this.mapOfUserOidToConversations.get(oid);
        if (!conversations) { conversations = new Set<ConversationTracker>(); }
        conversations.add(conversation);
        this.mapOfUserOidToConversations.set(oid, conversations);
    }

    findAllConversations(oid: string): ConversationTracker[] {
        return Array.from(this.mapOfUserOidToConversations.get(oid));
    }

    async storeConversation(conversation: ConversationTracker) {
        return new Promise<void>(async (resolve, reject) => {
            try {
                await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                    await this.conversationAccessor.set(turnContext, conversation);
                    return resolve(await this.conversationState.saveChanges(turnContext));  // not awaiting since outer function can await.
                });
            } catch (err) {
                reject("Couldn't write state for converation");
            }
        });
    }

    async finishUserConversationKeyToOidAssociation(userConversationKey: string, userOid: string, userAuthManagerKey: string): Promise<ConversationTracker | undefined> {
        let conversation = this.mapOfUserConversationKeytoConversation.get(userConversationKey);
        if (conversation) {
            // Remove ephemeral UserConversationKey to conversation from Map.
            this.mapOfUserConversationKeytoConversation.delete(userConversationKey);  // no longer used

            // Update conversation state
            delete conversation.userConversationKey;
            conversation.userOid = userOid;
            conversation.userAuthKey = userAuthManagerKey;
            // !To Do - where to handle verification

            // Store the conversation in the Oid Set.
            this.addConversationToOidSet(userOid, conversation);

            await this.storeConversation(conversation);

            // Store the updated user
            await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                let userData = await this.userAccessor.get(turnContext, {});
                userData.userOid = conversation.userOid;
                await this.userAccessor.set(turnContext, userData);
                await this.userState.saveChanges(turnContext);
            });
            return conversation;
        }
        return undefined;
    }

    private async setBotAuthId(oid: string, authId: string) {
        let conversations = this.findAllConversations(oid);
        let updates = conversations.map(c => {
            c.userOid = oid;
            return this.storeConversation(c);
        });
        return Promise.all(updates);
    }

    private async prepConversationForLogin(conversation: ConversationTracker) {
        if (conversation && conversation.userOid && conversation.userAuthKey) throw 'bad convesation in login prep';
        let userConversationKey = generateSecretKey(8);
        conversation.userConversationKey = userConversationKey,
            this.mapOfUserConversationKeytoConversation.set(conversation.userConversationKey, conversation);
    }

    async onTurn(turnContext: TurnContext, adapter: BotFrameworkAdapter) {
        // By checking the incoming Activity type, the bot only calls LUIS in appropriate cases.

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
                        let signinCardAttachment = CardFactory.signinCard('title', `http://localhost:8080/bot-login?conversationKey=${conversation.userConversationKey}`, 'text on the card');
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
