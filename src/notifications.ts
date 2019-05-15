
import { OutlookTask } from '@microsoft/microsoft-graph-types-beta';
import { app, AppConfig } from './nagbotApp';
import { logger } from './utils';

export async function notify(forceNotifications: boolean = false) {
    if (!app.users) return;
    for await (const [oid] of app.users) {
        notifyUser(oid, forceNotifications);
        return;
    };
}

export async function notifyUser(oid: string, forceNotifications: boolean = false) {
    try {
        let accessToken = await app.authManager.getAccessTokenFromOid(oid);
        let user = app.users.get(oid);
        console.log(logger`checking notifications for ${user.email} (${oid.substring(0,5)}...)`);
        let tasks = await app.graph.findTasks(accessToken);
        console.log(logger`found ${tasks.length} tasks`);
        for (const task of tasks) {
            let policy = evaluateNotificationPolicy(task);
            if (!policy.notify && !forceNotifications) continue;
            await taskNotify(oid, task, policy);
        }
    }
    catch (err) {
        let context = await app.authManager.getAuthContextFromOid(oid);
        console.log(logger`notify failed at ${new Date(Date.now()).toString()} and token expires ${ context.expiresOn.toString() }`,err);
    }
}

async function taskNotify(oid: string, task: OutlookTask, policy: NagPolicyEvaluationResult) {
    console.log(logger`task "${task.subject}" is ready with last nag date of ${ policy.lastNag.toString() }`);
    let conversations = app.conversationManager.findAll(oid);
    for (const conversation of conversations) {
        if (!conversation.nagEnabled) continue;
        await app.botService.processActivityInConversation(conversation, async turnContext => {
            try {
                let dueMessage = (policy.daysUntilDue >= 0) ? `due in ${policy.daysUntilDue} days` : `overdue by ${-policy.daysUntilDue} days`;
                let editUrl = app.appHttpServer.taskEditUrl(task.id);
                let now = new Date(Date.now());

                console.log(logger`sending notificaton to ${conversation.channelId} (${conversation.conversation.id.substring(0,20)}...`)
                await turnContext.sendActivity(`Reminder for "${task.subject}". \r\nIt is ${dueMessage}. [link](${editUrl})`);

                updateNagLast(task, now);
                let accessToken = await app.authManager.getAccessTokenFromOid(oid);
                await app.graph.updateTask(accessToken, task);
            } catch (err) {
                console.log(logger`notify/processActivityInConversation failed.`,err);
            }
        });
    }
}

interface NagPolicyEvaluationResult {
    notify: boolean,
    daysUntilDue: number,
    minsSinceNag: number,
    lastNag: Date
}

function evaluateNotificationPolicy(task: OutlookTask): NagPolicyEvaluationResult {
    let dueDate = new Date(Date.parse(task.dueDateTime && task.dueDateTime.dateTime));
    let nagProperties = task.singleValueExtendedProperties;
    let nagPolicy = nagProperties && nagProperties.find((i) => i.id.split(' ')[3] == "NagPreferences");
    let lastNagProperty = nagProperties && nagProperties.find((i) => i.id.split(' ')[3] == "NagLast");
    let lastNag = lastNagProperty && lastNagProperty.value ? (new Date(Date.parse(lastNagProperty.value))) : new Date(0);
    let daysSinceNag = Math.trunc((Date.now() - lastNag.valueOf()) / (1000 * 60 * 60 * 24));  // Should convert to UTC to do this calc.
    let minsSinceNag = Math.trunc((Date.now() - lastNag.valueOf()) / (1000 * 60));
    let daysUntilDue = Math.trunc((dueDate.valueOf() - Date.now()) / (1000 * 60 * 60 * 24));
    switch (nagPolicy) {
        case 'daily':
            // once per day
            return { notify: (daysSinceNag > 0), daysUntilDue, minsSinceNag, lastNag};

        case 'standard':
        default:
            // once per hour on day of nag or overdue otherwise once per day
            let dueOrOverdue = daysUntilDue < 1;
            let notify = ((dueOrOverdue && minsSinceNag > AppConfig.dueTodayPolicyIntervalMin) || (!dueOrOverdue && minsSinceNag > 24 * 60));
            return { notify, daysUntilDue, minsSinceNag, lastNag };
    }
}

function updateNagLast(task: OutlookTask, time: Date) {
    if (!task.singleValueExtendedProperties) { task.singleValueExtendedProperties = []; }
    let lastNagProperty = task.singleValueExtendedProperties.find((i) => i.id.split(' ')[3] == "NagLast");
    if (!lastNagProperty) task.singleValueExtendedProperties.push(lastNagProperty = { id: app.graph.propertyNagLast });
    lastNagProperty.value = time.toISOString();
}
