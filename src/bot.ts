// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes, RecognizerResult, TurnContext, CardFactory, BrowserLocalStorage } from 'botbuilder';
import { LuisApplication, LuisPredictionOptions, LuisRecognizer } from 'botbuilder-ai';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';

/**
 * A simple bot that responds to utterances with answers from the Language Understanding (LUIS) service.
 * If an answer is not found for an utterance, the bot responds with help.
 */
export class SimpleBot {

    /**
     * Every conversation turn calls this method.
     * There are no dialogs used, since it's "single turn" processing, meaning a single request and
     * response, with no stateful conversation.
     * @param turnContext A TurnContext instance, containing all the data needed for processing the conversation turn.
     */
    async onTurn(turnContext: TurnContext) {
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
                        await turnContext.sendActivity('Sending an oauthCard');
                        let signinCardAttachment = CardFactory.signinCard('title','http://localhost:8080/login?magic=xyzzy','text on the card');
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
                    await turnContext.sendActivity('Welcome to the NLP with LUIS sample! Send me a message and I will try to predict your intent.');
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
