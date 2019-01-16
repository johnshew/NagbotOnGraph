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
                let date = new Date(Date.parse(task.dueDateTime && task.dueDateTime.dateTime));
                console.log(`${task.subject} due ${date.toLocaleDateString()}`);
                let conversations = app.conversationManager.findAllConversations(oid);
                for (const c of conversations) {
                    await app.conversationManager.processActivityInConversation(app.adapter, c, async turnContext => {
                        await turnContext.sendActivity('You should take care of ' + task.subject);
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