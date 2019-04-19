

import { app } from '../src/app';

describe("Working", () => {
    test("Check app configuration", async(done) => {
        await app.ready;
        console.log('Application ready and test starting ');
        expect(app.authManager).toBeDefined();
        expect(app.botService).toBeDefined();
        expect(app.conversationManager).toBeDefined();
        expect(app.graph).toBeDefined();
        expect(app.appHttpServer).toBeDefined();
        expect(app.users).toBeDefined();
        await app.close();
        console.log('Application test complete')
        done();
    })
});
