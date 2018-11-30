// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import { ActivityTypes, BotFrameworkAdapter, CardFactory, ConversationReference, TurnContext, ConversationState, UserState, StatePropertyAccessor } from 'botbuilder';
import { randomBytes } from 'crypto';


/**
 * A simple bot that responds to utterances with answers from the Language Understanding (LUIS) service.
 * If an answer is not found for an utterance, the bot responds with help.
 */

async function sleep(milliseconds) {
    return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}


class ConversationTracker {
    adapter?: BotFrameworkAdapter;
    reference?: Partial<ConversationReference>;
    userConversationKey?: string // locally generated for purposes of verifying no "man in the middle" on the bot.
    verified?: boolean;
    verificationKey?: string // locally generated and ephemeral
    userOid?: string // from Oauth - uniquely identifies this user - and is used to find conversations.
    userAuthKey?: string;  // secret key that can be shared with client over a secure channel
    expiresOn?: Date;
}

class UserTracker {
    userOid? : string;
}

export function generateSecretKey(length : number= 48): string {
    let buf = randomBytes(length);
    return buf.toString('hex');
}

export class NagBot {


    constructor (private conversationState : ConversationState,  private userState : UserState) {
        // Create the state property accessors for the conversation data and user profile.
        this.conversationAccessor = this.conversationState.createProperty<ConversationTracker>('conversationData');
        this.userAccessor = this.userState.createProperty<UserTracker>('userData');
    }

    private conversationAccessor : StatePropertyAccessor<ConversationTracker>;
    private userAccessor : StatePropertyAccessor<UserTracker>;
    private mapOfUserConversationKeytoConversation = new Map<string, ConversationTracker>();  // only one of these per magic connection.  Ephemeral
    private mapOfUserOidToConversations = new Map<string, [ConversationTracker]>(); // known converationsWithAUser

    /**
     * Every conversation turn calls this method.
     * There are no dialogs used, since it's "single turn" processing, meaning a single request and
     * response, with no stateful conversation.
     * @param turnContext A TurnContext instance, containing all the data needed for processing the conversation turn.
     */

    async processProactiveActivity(userOid: string, logic: (TurnContext) => Promise<any>) {
        let conversation = this.mapOfUserOidToConversations.get(userOid)[0]; //!TO DO more than one.  Use the first.
        if (conversation.adapter && conversation.reference) {
            await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                return await logic(turnContext);
            });
        }
        else return Promise.reject("Couldn't continue converation");
    }

    async conversationVerified(userConversationKey: string, userOid: string) {
        let conversation = this.mapOfUserConversationKeytoConversation.get(userConversationKey);
        if (conversation) {
            conversation.userOid =userOid;
            conversation.verified = true;
            delete conversation.userConversationKey, conversation.verificationKey;
            this.mapOfUserConversationKeytoConversation.delete(userConversationKey);  // no loger used
            this.mapOfUserOidToConversations.set(userOid, [conversation]); // probably should check for duplication
            await conversation.adapter.continueConversation(conversation.reference, async (turnContext) => {
                let userData = await this.userAccessor.get(turnContext, {});
                userData.userOid = conversation.userOid;
                await this.userAccessor.set(turnContext, userData);
                await this.conversationAccessor.set(turnContext, conversation);
                await this.userState.saveChanges(turnContext);
                await this.conversationState.saveChanges(turnContext);
            });
            return true;
        }
        return false;
    }
    async setBotAuthId(userConversationKey: string, authId: string) {
        let conversation = this.mapOfUserConversationKeytoConversation.get(userConversationKey);
        conversation.userAuthKey = authId;
        this.mapOfUserConversationKeytoConversation.set(userConversationKey, conversation);
    }

    async onTurn(turnContext: TurnContext, adapter: BotFrameworkAdapter) {
        // By checking the incoming Activity type, the bot only calls LUIS in appropriate cases.
        
        console.log(`onTurn: ${JSON.stringify(turnContext)}`);
        const user = await this.userAccessor.get(turnContext, {});
        const conversation = await this.conversationAccessor.get(turnContext, { verified: false });
        const activity = turnContext.activity;
        switch (turnContext.activity.type) {
            case ActivityTypes.Message:
                switch (activity.text.toLowerCase().trim()) {
                    case 'login':
                        let oauthCardAttachment = CardFactory.oauthCard("AAD-OAUTH", 'title', 'text');
                        console.log(`Attachment: ${JSON.stringify(oauthCardAttachment)}`);
                        await turnContext.sendActivity({ attachments: [oauthCardAttachment] });
                        return;
                    case 'signin':
                        let userConversationKey = generateSecretKey(8);
                        let conversation = { 
                            reference: TurnContext.getConversationReference(turnContext.activity),
                            adapter: adapter,
                            verified: false,
                            userConversationKey: userConversationKey,
                        };
                        this.mapOfUserConversationKeytoConversation.set(conversation.userConversationKey, conversation);
                        await this.conversationAccessor.set(turnContext,conversation);
                        await this.conversationState.saveChanges(turnContext);
                        let signinCardAttachment = CardFactory.signinCard('title', `http://localhost:8080/bot-login?conversationKey=${userConversationKey}`, 'text on the card');
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
