// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { randomBytes } from 'crypto';
import { app, AppConfig } from './app';
import { Activity, ActionTypes, Storage, ActivityTypes, BotAdapter, CardFactory, ConversationReference, TurnContext, ConversationState, UserState, StatePropertyAccessor } from 'botbuilder';
import { ConversationManager} from './conversations';
import { User } from './user';

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
    private userAccessor: StatePropertyAccessor<User>;
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
        this.userAccessor = this.userState.createProperty<User>('userData');
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
        console.log(`onTurn: ${JSON.stringify(turnContext,null,2)}`);
        const activity = turnContext.activity;
        let user = await this.userAccessor.get(turnContext, {});
        let conversation = await this.conversationAccessor.get(turnContext) || new ConversationStatus();

        switch (turnContext.activity.type) {
            case ActivityTypes.Message:
                switch (activity.text.toLowerCase().trim()) {
                    case 'login':
                        let oauthCardAttachment = CardFactory.oauthCard("AAD-OAUTH", 'title', 'text');
                        console.log(`Attachment: ${JSON.stringify(oauthCardAttachment,null,2)}`);
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

                        let signinCardAttachment = CardFactory.signinCard('Office 365 Login', `${AppConfig.botLoginUrl}?conversationKey=${conversation.tempVerficationKey}`, 'Click below to connect NagBot to your tasks.');
                        
                        if (turnContext.activity.channelId == 'msteams') {
                            // hack to fix teams.
                            signinCardAttachment.content.buttons[0].type = ActionTypes.OpenUrl;
                        }
    
                        console.log(`Attachment: ${JSON.stringify(signinCardAttachment,null,2)}`);
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
                // TODO Handle OauthCard as login.
                if (activity.name && activity.name === "tokens/response" && activity.value.token) {
                    await turnContext.sendActivity('Got a token');
                    let token = activity.value.token;
                    let result = app.graph.get(token,'https://graph.microsoft.com/v1.0/me/');
                    await turnContext.sendActivity(`Result: ${JSON.stringify(result,null,2)}`);
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
