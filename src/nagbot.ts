// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes, RecognizerResult, TurnContext, CardFactory, BrowserLocalStorage, ConversationReference, BotFrameworkAdapter } from 'botbuilder';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';


/**
 * A simple bot that responds to utterances with answers from the Language Understanding (LUIS) service.
 * If an answer is not found for an utterance, the bot responds with help.
 */

async function sleep(milliseconds) {
    return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}

class ConversationState {
    adapter?: BotFrameworkAdapter;
    reference?: Partial<ConversationReference>;
    userConversationKey?: string // locally generated for purposes of verifying no "man in the middle" on the bot.
    verified?: boolean;
    verificationKey?: string // locally generated and ephemeral
    userOid?: string // from Oauth - uniquely identifies this user - and is used to find conversations.
    userAuthKey?: string;  // secret key that can be shared with client over a secure channel
    expiresOn?: Date;
}

export class NagBot {

    public mapOfUserConversationKeytoConversation = new Map<string, ConversationState>();  // only one of these per magic connection.  Ephemeral
    public mapOfUserOidToConversations = new Map<string, [ConversationState]>(); // known converationsWithAUser

    /**
     * Every conversation turn calls this method.
     * There are no dialogs used, since it's "single turn" processing, meaning a single request and
     * response, with no stateful conversation.
     * @param turnContext A TurnContext instance, containing all the data needed for processing the conversation turn.
     */


    async processProactiveActivity(userOid: string, logic: (TurnContext) => Promise<any>) {
        let conversation = this.mapOfUserOidToConversations.get(userOid)[0]; //!TO DO more than one.
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
        const activity = turnContext.activity;
        switch (turnContext.activity.type) {
            case ActivityTypes.Message:
                switch (activity.text.toLowerCase().trim()) {
                    case 'login':
                        await turnContext.sendActivity('Sending an oauthCard');
                        let oauthCardAttachment = CardFactory.oauthCard("AAD-OAUTH", 'title', 'text');
                        console.log(`Attachment: ${JSON.stringify(oauthCardAttachment)}`);
                        await turnContext.sendActivity({ attachments: [oauthCardAttachment] });
                        return;
                    case 'signin':
                        await turnContext.sendActivity('Sending an signinCard');
                        let userConversationKey = 'xyzzy'; // should be randomly generated
                        this.mapOfUserConversationKeytoConversation.set(userConversationKey, {
                            reference: TurnContext.getConversationReference(turnContext.activity),
                            adapter: adapter,
                            verified: false,
                            userConversationKey: userConversationKey,
                        });
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
