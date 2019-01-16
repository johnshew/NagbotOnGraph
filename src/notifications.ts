import { app } from './app';

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
                let nagLast = task.singleValueExtendedProperties && task.singleValueExtendedProperties.find((i) => i.id.split(' ')[3] == "NagLast");
                let nagLastDate = nagLast ? (new Date(Date.parse(nagLast.value))) : new Date(0);
                let daysSinceNag = Math.trunc((dueDate.valueOf() - nagLastDate.valueOf()) / (1000 * 60 * 60 * 24));  // Should convert to UTC to do this calc.
                let daysUntilDue = Math.trunc((dueDate.valueOf() - Date.now()) / (1000 * 60 * 60 * 24));
                console.log(`${task.subject} due ${daysUntilDue} days on ${dueDate.toLocaleDateString()}`);
                let conversations = app.conversationManager.findAllConversations(oid);
                for (const c of conversations) {
                    if (daysSinceNag <= 1) continue;
                    await app.conversationManager.processActivityInConversation(app.adapter, c, async turnContext => {
                        let message = (daysUntilDue > 0) ? `due in ${daysUntilDue}` : `overdue by ${-daysUntilDue}`;
                        await turnContext.sendActivity(
`Task: ${task.subject}
${message} days`);
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