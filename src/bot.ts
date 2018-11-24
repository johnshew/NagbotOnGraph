// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes, RecognizerResult, TurnContext, CardFactory } from 'botbuilder';
import { LuisApplication, LuisPredictionOptions, LuisRecognizer } from 'botbuilder-ai';

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
    public async onTurn(turnContext: TurnContext) {
        // By checking the incoming Activity type, the bot only calls LUIS in appropriate cases.
        if (turnContext.activity.type === ActivityTypes.Message) {
            switch (turnContext.activity.text.toLowerCase().trim()) {
                case 'login':
                await turnContext.sendActivity('Sending an oauthCard');
                await turnContext.sendActivity({ attachments: [CardFactory.oauthCard("AAD-OAUTH", 'title', 'text')]});
                    return;
                default:
                    await turnContext.sendActivity(`Hello`);
                    return;
            }

        } else if (turnContext.activity.type === ActivityTypes.ConversationUpdate &&
            turnContext.activity.recipient.id !== turnContext.activity.membersAdded[0].id) {
            // If the Activity is a ConversationUpdate, send a greeting message to the user.
            await turnContext.sendActivity('Welcome to the NLP with LUIS sample! Send me a message and I will try to predict your intent.');
        } else if (turnContext.activity.type !== ActivityTypes.ConversationUpdate) {
            // Respond to all other Activity types.
            await turnContext.sendActivity(`[${turnContext.activity.type}]-type activity detected.`);
        } else {
            await turnContext.sendActivity(`Activity type: ${ turnContext.activity.type } `);
        }
    }
}
