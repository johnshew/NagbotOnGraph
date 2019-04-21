// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { randomBytes } from 'crypto';
import { app, AppConfig } from './app';
import { ActionTypes, Storage, ActivityTypes, BotAdapter, CardFactory, ConversationReference, TurnContext, ConversationState, UserState, StatePropertyAccessor, MessageFactory, InputHints, RecognizerResult } from 'botbuilder';
import { ConversationManager } from './conversations';
import { User } from './users';
import { LuisApplication, LuisPredictionOptions, LuisRecognizer } from 'botbuilder-ai'
import { OutlookTask } from './officeGraph';
import { userAgentPolicy } from '@azure/ms-rest-js';
import { truncate } from 'fs';
import { forOfStatement } from '@babel/types';
import { doesNotReject } from 'assert';


type LuisIntents = "None"
    | "Channels_Clear"
    | "Channels_List"
    | "None"
    | "Notification_Off"
    | "Notification_On"
    | "Reminder_Change"
    | "Reminder_Create"
    | "Reminder_Delete"
    | "Reminder_Find"
    | "Reminder.Location"
    | "Timezone_Adust"
    | "Timezone_Query"
    | "Utilities_Help"
    | "Yes"
    | "No"
    | "Entity"
    ;

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

    private model: LuisRecognizer;

    constructor(config: NagBotConfig) {
        if (!config || !config.store || !config.conversationManager) throw 'Missing config members needed for NagBot constructor';
        this.store = config.store;
        this.conversationManager = config.conversationManager;

        this.conversationState = new ConversationState(this.store);
        this.userState = new UserState(this.store);

        // Map the contents to the required format for `LuisRecognizer`.
        const luisApplication: LuisApplication = {
            applicationId: AppConfig.luisId,
            endpointKey: AppConfig.luisKey
        }

        // Create configuration for LuisRecognizer's runtime behavior.
        const luisPredictionOptions: LuisPredictionOptions = {
            includeAllIntents: true,
            log: true,
            staging: AppConfig.luisStaging,
            // timezoneOffset: 0
        }
        this.model = new LuisRecognizer(luisApplication, luisPredictionOptions);

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
        console.log(`onTurn started`);
        const activity = turnContext.activity;
        let user = await this.userAccessor.get(turnContext, {});
        let conversation = await this.conversationAccessor.get(turnContext) || new ConversationStatus();

        switch (turnContext.activity.type) {
            case ActivityTypes.Message:
                switch (activity.text.toLowerCase().trim()) {
                    case 'login':
                        if (!('getUserToken' in turnContext.adapter)) throw new Error(`OAuthPrompt.prompt(): not supported for the current adapter.`);
                        // Check to ensure channel supports it
                        let message = MessageFactory.text('Office 365 Login', undefined, InputHints.ExpectingInput);
                        let oauthCardAttachment = CardFactory.oauthCard("AAD-OAUTH", 'title', 'text');
                        message.attachments = [oauthCardAttachment];
                        console.log(`Attachment: ${JSON.stringify(oauthCardAttachment, null, 2)}`);
                        await turnContext.sendActivity(message);
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
                        this.conversationManager.addUnauthenticatedConversation(conversation.tempVerficationKey, TurnContext.getConversationReference(activity));
                        // await this.conversationAccessor.set(turnContext, conversation);
                        // await this.conversationState.saveChanges(turnContext);

                        let signinCardAttachment = CardFactory.signinCard('Office 365 Login', `${AppConfig.botLoginUrl}?conversationKey=${conversation.tempVerficationKey}`, 'Click below to connect NagBot to your tasks.');

                        if (turnContext.activity.channelId == 'msteams') {
                            // hack to fix teams.
                            signinCardAttachment.content.buttons[0].type = ActionTypes.OpenUrl;
                        }

                        console.log(`Attachment: ${JSON.stringify(signinCardAttachment, null, 2)}`);
                        await turnContext.sendActivity({ attachments: [signinCardAttachment] });
                        return;
                    default:
                        await this.onTurnLuis(turnContext);
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
                    let result = app.graph.get(token, 'https://graph.microsoft.com/v1.0/me/');
                    await turnContext.sendActivity(`Result: ${JSON.stringify(result, null, 2)}`);
                }
                break;

            default:
                await turnContext.sendActivity(`[${turnContext.activity.type}]-type activity detected. ${JSON.stringify(turnContext, null, 2)}`);
                break;
        }
    }

    async onTurnLuis(turnContext: TurnContext) {
        try {
            let results = await this.model.recognize(turnContext);
            const topIntent = <LuisIntents>LuisRecognizer.topIntent(results);
            let user = await this.userAccessor.get(turnContext, {});
            switch (topIntent) {
                case 'Channels_Clear':
                    if (user && user.oid) {
                        await app.conversationManager.clear(user.oid);
                        await turnContext.sendActivity('All channels logged out');
                    } else {
                        await turnContext.sendActivity('Login in to clear channels');
                    }
                    break;
                case 'Reminder_Create':
                    if (user && user.oid) {
                        const text = results.entities["Reminder_Text"];
                        const due = results.entities["datetime"];
                        if (text) {
                            let task: OutlookTask = { subject: "test" };
                            let accessToken = await app.authManager.getAccessTokenFromOid(user.oid);
                            let savedTask = await app.graph.insertTask(accessToken, task);
                            if (savedTask && savedTask.id) await turnContext.sendActivity(`Created new task (${text}) with id: ${savedTask.id}`);
                        } else {
                            await turnContext.sendActivity('Unable to create reminder - missing subject');
                        }
                    } else {
                        await turnContext.sendActivity('Login in to create reminders');
                    }
                    break;
                case 'Reminder_Find':
                    if (user && user.oid) {
                        let accessToken = await app.authManager.getAccessTokenFromOid(user.oid);
                        let tasks = await app.graph.findTasks(accessToken)
                        let tasksList = tasks.reduce((prev, cur) => {
                            return prev + ((prev.length > 0) ? ', ' + cur.subject : cur.subject);
                        }, '');
                        await turnContext.sendActivity(`Tasks: (${tasksList})`);
                    } else {
                        await turnContext.sendActivity('Login in see reminders');
                    }
                    break;
                case 'Utilities_Help':
                    await turnContext.sendActivity(helpMessage);
                    break;
                case 'None':
                default:
                    await turnContext.sendActivity(`Unknown intent ${topIntent}`);
                    break;
            }

        } catch (err) {
            console.log('Error in onTurnLuis', err);
        }
    }

    async getUser(turnContext: TurnContext) {
        return await this.userAccessor.get(turnContext);
    }

    async setUser(turnContext: TurnContext, user: User) {
        await this.userAccessor.set(turnContext, user);
        await this.userState.saveChanges(turnContext);
    }
}

function generateSecretKey(length: number = 16): string {
    let buf = randomBytes(length);
    return buf.toString('hex');
}

function guid() { return generateSecretKey(32); }

const helpMessage = `I am NagBot.

Here a few of the things we can do
* Clear channels
* Notifications on
* Stop noitifications

Reminders and reminders
* Remind me to walk the dog tomorrow noon
* List reminders
* What are my reminders?
* Find walk the dog
`;


enum PlanName {
    "ChannelClear",
    "ChannelList",
    "ReminderCreate",
    "ReminderFind",
    "ReminderActions"
}

class PlanManager {
    planConversations: Map<PlanName, any>;
    turnContext: TurnContext;
    conversation: any;
    recognized: RecognizerResult;
    user: User;
    currentContext: TurnContext;
    turnSource: AsyncIterator<any>;


    score(intentName: LuisIntents): number {
        let intent = this.recognized.intents[intentName];
        return (!intent) && 0 || intent.score;
    }

    recent(seconds: number = 60) {
        return true;
    }

    started() { return this.conversation.started; }

    start() { this.conversation.started = true; this.conversation.startedAt = Date.now(); }
}

async function planChannelClear(step: PlanManager) {
    let actions = [
        [step.score("Channels_Clear") > 0.8,
        async () => {
            await step.turnContext.sendActivity("Are you sure?");
            step.conversation.active = true;
            step.conversation.started = Date.now();
            return { active: true }
        }],
        [step.started() && step.recent() && step.score('Yes') > 0.8,
        async () => {
            app.conversationManager.clear(step.user.oid);
            await step.turnContext.sendActivity('Okay.  Channels are cleared');
            return { reset: true }
        }
        ]
    ]
    return actions;
}

async function planFind(step: PlanManager) {
    let actions = [
        [step.score("Reminder_Find") > 0.8 && !step.started(),
        async () => {
            step.start()
            step.conversation.text = step.recognized.entities['Reminder_Text'];
            step.conversation.date['DateTimeV2'];
            return { again: true };
        }],
        [step.started() && step.conversation.text && step.conversation.date && step.score('Yes') > 0.8,
        async () => {
            app.conversationManager.clear(step.user.oid);
            await step.turnContext.sendActivity('Okay.  Channels are cleared');
            return { reset: true }
        }],
        [step.started() && !step.conversation.text && step.conversation.date && step.score('Yes') > 0.8,
        async () => {
            app.conversationManager.clear(step.user.oid);
            await step.turnContext.sendActivity('Okay.  Channels are cleared');
            return { reset: true }
        }],
        [step.started() && step.conversation.text && step.conversation.date && step.score('Yes') > 0.8,
        async () => {
            app.conversationManager.clear(step.user.oid);
            await step.turnContext.sendActivity('Okay.  Channels are cleared');
            return { reset: true }
        }
        ]
    ]
    return actions;
}




async function* planPromptReminderText(planManager: PlanManager, prompt: string = null) {
    if (prompt) {
        planManager.currentContext.sendActivity(prompt);
    }
    yield { done: false, result: undefined }
    let turnResult = await planManager.turnSource.next();
    while (!turnResult.done) {        
        if (turnResult.value.entities.score("Reminder_Text") > 0.8) {
            let result = turnResult.value.entities["Reminder_Text"].value;
            yield { done: true, result: result }
            return;
        }        
    }
}

/* class TurnGenerator {
    foo() { return 'ham'; }
    ['bar']() { return 'cheese' }

    [Symbol.iterator] = function* () {
        yield 1;
        yield 2;
        yield 1 + 2;
    };

    [Symbol.asyncIterator] = async function* () {
        yield 1;
        yield 1+2;
    };
}

let thing = new TurnGenerator();
async function testThing() {
    thing.foo();
    thing['bar']();
    for (const item of thing) {
        console.log(item);
    }
    for await (const item of thing) {
        console.log(item)
    }
    let foo = thing[Symbol.asyncIterator]();
    let next = await foo.next();
    while (!next.done) {
        console.log(next.value);
        next = await foo.next();
    }
}
 */