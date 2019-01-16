import { app } from './app';

function checkPolicy(policy: any, dueDate: Date, lastNagDate: Date): { notify: boolean, daysUntilDue: number } {
    let daysSinceNag = Math.trunc((dueDate.valueOf() - lastNagDate.valueOf()) / (1000 * 60 * 60 * 24));  // Should convert to UTC to do this calc.
    let daysUntilDue = Math.trunc((dueDate.valueOf() - Date.now()) / (1000 * 60 * 60 * 24));
    return { notify: (daysSinceNag > 0) , daysUntilDue: daysUntilDue };
}

export async function notify() {
    let users = app.users;
    app.users && users.forEach(async (user, key) => {
        try {
            let oid = user.oid;
            let accessToken = await app.authManager.accessTokenForOid(oid);
            console.log(`User: ${oid}`);
            let tasks = await app.graph.getNagTasks(accessToken);
            for (const task of tasks) {
                let dueDate = new Date(Date.parse(task.dueDateTime && task.dueDateTime.dateTime));
                let lastNag = task.singleValueExtendedProperties && task.singleValueExtendedProperties.find((i) => i.id.split(' ')[3] == "NagLast");
                let lastNagDate = lastNag ? (new Date(Date.parse(lastNag.value))) : new Date(0);
                let policy = checkPolicy('base', dueDate, lastNagDate);
                if (!policy.notify) return;

                let conversations = app.conversationManager.findAllConversations(oid);
                for (const c of conversations) {
                    await app.conversationManager.processActivityInConversation(app.adapter, c, async turnContext => {
                        let dueMessage = (policy.daysUntilDue > 0) ? `due in ${policy.daysUntilDue} days` : `overdue by ${-policy.daysUntilDue} days`;
                        await turnContext.sendActivity(
                            `Task: ${task.subject} ${dueMessage}`);
                        // update NagLast with current time.
                    });
                }
            }
        }
        catch (err) {
            console.log(`Error in notify: ${err}`);
        }
        return;
    });
}