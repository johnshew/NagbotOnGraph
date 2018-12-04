import { default  as  app } from './app';

function tick() {
    app.users.forEach(async u => {
        try {
            let accessToken = await app.authManager.accessTokenForAuthKey(u.authKey);
            let result = await app.graphHelper.get(accessToken, "http://graph.microsoft.com/v1.0/me");
            console.log(`User: ${JSON.stringify(result)} `);
        } catch (err) {
        }
    });
}

setInterval(() => tick(), 9 * 1000);
