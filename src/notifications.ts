import { app } from './app';
import { SingleValueLegacyExtendedProperty, OutlookTask } from '@microsoft/microsoft-graph-types-beta';

function checkNotificationPolicy(policy: any, task: OutlookTask): { notify: boolean, daysUntilDue: number } {
    let dueDate = new Date(Date.parse(task.dueDateTime && task.dueDateTime.dateTime));
    let lastNag = task.singleValueExtendedProperties && task.singleValueExtendedProperties.find((i) => i.id.split(' ')[3] == "NagLast");
    let lastNagDate = lastNag && lastNag.value ? (new Date(Date.parse(lastNag.value))) : new Date(0);
    let daysSinceNag = Math.trunc((dueDate.valueOf() - lastNagDate.valueOf()) / (1000 * 60 * 60 * 24));  // Should convert to UTC to do this calc.
    let daysUntilDue = Math.trunc((dueDate.valueOf() - Date.now()) / (1000 * 60 * 60 * 24));
    if (policy == 'base') return { notify: (daysSinceNag > 0), daysUntilDue: daysUntilDue };
    else return { notify: true, daysUntilDue: daysUntilDue };
}

function updateNagLast(task: OutlookTask, time: Date) {
    let now = new Date(Date.now()).toISOString();
    if (!task.singleValueExtendedProperties) { task.singleValueExtendedProperties = []; }
    let singleValueLegacyExtendedProperty = task.singleValueExtendedProperties.find((i) => i.id.split(' ')[3] == "NagLast")
    if (singleValueLegacyExtendedProperty) { singleValueLegacyExtendedProperty.value = time.toISOString(); }
    else { task.singleValueExtendedProperties.push({ id: 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast', value: time.toISOString() }); }
}

export async function notify() {
    if (!app.users) return;
    for await (const [oid, user] of app.users) {
        try {
            let accessToken = await app.authManager.accessTokenForOid(oid);
            console.log(`User: ${oid}`);
            let tasks = await app.graph.getNagTasks(accessToken);
            for await (const task of tasks) {

                let policy = checkNotificationPolicy('base', task);
                if (!policy.notify) return;

                let conversations = app.conversationManager.findAllConversations(oid);
                for await (const conversation of conversations) {
                    await app.conversationManager.processActivityInConversation(app.adapter, conversation, async turnContext => {
                        try {
                            let dueMessage = (policy.daysUntilDue > 0) ? `due in ${policy.daysUntilDue} days` : `overdue by ${-policy.daysUntilDue} days`;
                            let editMessage = `http://localhost:8080/editTask?oid=${encodeURIComponent(oid)}&taskid=${encodeURIComponent(task.id)}`;
                            let now = new Date(Date.now());

                            await turnContext.sendActivity(`Task: ${task.subject} ${dueMessage} ${editMessage}`)
                            .catch(err => { throw Error(`notify/sendActivity failed ${err}`); })

                            updateNagLast(task, now);
                            let body = { singleValueExtendedProperties: task.singleValueExtendedProperties };
                            await app.graph.patch(accessToken, `https://graph.microsoft.com/beta/me/outlook/tasks/${task.id}`, body)
                            .catch(err => { throw Error(`Notify/patch failed (${err})`) });
                        } catch (err) {
                            console.log(`notify/processActivityInConversation failed (${err})`);
                        }
                    });
                }
            }
        }
        catch (err) {
            console.log(`notify failed (${err})`);
        }
        return;
    };
}