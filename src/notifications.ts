import { app } from './app';
import { SingleValueLegacyExtendedProperty } from '@microsoft/microsoft-graph-types-beta';

function checkPolicy(policy: any, dueDate: Date, lastNagDate: Date): { notify: boolean, daysUntilDue: number } {
    let daysSinceNag = Math.trunc((dueDate.valueOf() - lastNagDate.valueOf()) / (1000 * 60 * 60 * 24));  // Should convert to UTC to do this calc.
    let daysUntilDue = Math.trunc((dueDate.valueOf() - Date.now()) / (1000 * 60 * 60 * 24));
    if (policy == 'base') return { notify: (daysSinceNag > 0) , daysUntilDue: daysUntilDue };
    else return { notify: true, daysUntilDue: daysUntilDue };
}

export async function notify() {
    if (!app.users) return;
    for await (const [oid, user] of app.users) {
        try {
            let accessToken = await app.authManager.accessTokenForOid(oid);
            console.log(`User: ${oid}`);
            let tasks = await app.graph.getNagTasks(accessToken);
            for await (const task of tasks) {
                let dueDate = new Date(Date.parse(task.dueDateTime && task.dueDateTime.dateTime));
                let lastNag = task.singleValueExtendedProperties && task.singleValueExtendedProperties.find((i) => i.id.split(' ')[3] == "NagLast");
                let lastNagDate = lastNag && lastNag.value ? (new Date(Date.parse(lastNag.value))) : new Date(0);
                let policy = checkPolicy('base', dueDate, lastNagDate);
                if (!policy.notify) return;
                let conversations = app.conversationManager.findAllConversations(oid);
                for await (const conversation of conversations) {
                    await app.conversationManager.processActivityInConversation(app.adapter, conversation, async turnContext => {
                        let dueMessage = (policy.daysUntilDue > 0) ? `due in ${policy.daysUntilDue} days` : `overdue by ${-policy.daysUntilDue} days`;
                        let now = new Date(Date.now()).toISOString();
                        if (lastNag) { lastNag.value = now; }
                        else { 
                            if (!task.singleValueExtendedProperties) { task.singleValueExtendedProperties = []; }
                            let property : SingleValueLegacyExtendedProperty = { id: 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast', value: now };
                            task.singleValueExtendedProperties.push(property);
                        }
                        await turnContext.sendActivity(`Task: ${task.subject} ${dueMessage}`).catch(err => console.log(`notify/sendActivity ${err}`));
                        let body = { singleValueExtendedProperties: task.singleValueExtendedProperties };
                        await app.graph.patch(accessToken,`https://graph.microsoft.com/beta/me/outlook/tasks/${task.id}`, body).catch(err => { 
                            console.log(`notify/sendActivity ${err}`); });                       
                    });
                }
            }
        }
        catch (err) {
            console.log(`Error in notify: ${err}`);
        }
        return;
    };
}