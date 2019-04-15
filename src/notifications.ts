import { app } from './app';
import { SingleValueLegacyExtendedProperty, OutlookTask } from '@microsoft/microsoft-graph-types-beta';


export async function notify() {
    if (!app.users) return;
    for await (const [oid] of app.users) {
        try {
            let accessToken = await app.authManager.accessTokenForOid(oid);
            if (!accessToken) { throw Error(`Unable to acquire access token from ${oid}`); }
            console.log(`User: ${oid}`);
            let tasks = await app.graph.findTasks(accessToken);
            for await (const task of tasks) {

                let policy = checkNotificationPolicy('quickly', task);
                if (!policy.notify) continue;

                console.log(`Task ${task.id}(${task.subject}) is ready for in policy`);
                let conversations = app.conversationManager.findAll(oid);
                for await (const conversation of conversations) {
                    console.log(`Sending notificaton to ${conversation.conversation.id}`)
                    await app.botService.processActivityInConversation(conversation, async turnContext => {
                        try {
                            let dueMessage = (policy.daysUntilDue > 0) ? `due in ${policy.daysUntilDue} days` : `overdue by ${-policy.daysUntilDue} days`;
                            let editMessage = app.appHttpServer.taskEditUrl(task.id);
                            // was let editMessage = `http://localhost:8080/complete-task?oid=${encodeURIComponent(oid)}&taskid=${encodeURIComponent(task.id)}`;
                            let now = new Date(Date.now());

                            await turnContext.sendActivity(`You have a task "${task.subject}" that is ${dueMessage}. [Mark complete](${editMessage})`)
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

function checkNotificationPolicy(policy: string, task: OutlookTask): { notify: boolean, daysUntilDue: number } {
    let dueDate = new Date(Date.parse(task.dueDateTime && task.dueDateTime.dateTime));
    let lastNag = task.singleValueExtendedProperties && task.singleValueExtendedProperties.find((i) => i.id.split(' ')[3] == "NagLast");
    let lastNagDate = lastNag && lastNag.value ? (new Date(Date.parse(lastNag.value))) : new Date(0);
    let daysSinceNag = Math.trunc((Date.now() - lastNagDate.valueOf()) / (1000 * 60 * 60 * 24));  // Should convert to UTC to do this calc.
    let minsSinceNag = Math.trunc((Date.now() - lastNagDate.valueOf()) / (1000 * 60));
    let daysUntilDue = Math.trunc((dueDate.valueOf() - Date.now()) / (1000 * 60 * 60 * 24));
    switch (policy) {
        case 'base':
            return { notify: (daysSinceNag > 0), daysUntilDue };
        case 'quickly':
            return { notify: (minsSinceNag > 2), daysUntilDue };
        default: return { notify: true, daysUntilDue };
    }
}

function updateNagLast(task: OutlookTask, time: Date) {
    let now = new Date(Date.now()).toISOString();
    if (!task.singleValueExtendedProperties) { task.singleValueExtendedProperties = []; }
    let singleValueLegacyExtendedProperty = task.singleValueExtendedProperties.find((i) => i.id.split(' ')[3] == "NagLast")
    if (singleValueLegacyExtendedProperty) { singleValueLegacyExtendedProperty.value = time.toISOString(); }
    else { task.singleValueExtendedProperties.push({ id: 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast', value: time.toISOString() }); }
}
