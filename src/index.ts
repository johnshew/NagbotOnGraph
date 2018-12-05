import { default as app } from './app';

function tick() {
    console.log('In tick');
    let users = app.users;
    users.forEach(async u => {
        try {
            let accessToken = await app.authManager.accessTokenForAuthKey(u.authKey);
            let result = await app.graphHelper.get(accessToken, "https://graph.microsoft.com/v1.0/me/");
            console.log(`User: ${JSON.stringify(result)} `);
        } catch (err) {
            console.log(`Error in tick: ${err}`);
        }
    });
}

setInterval(() => tick(), 9 * 1000);
