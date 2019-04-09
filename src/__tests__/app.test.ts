
import { app } from '../app';

describe("Working", () => {
    test("Check app configuration", async(done) => {
        await app.initialized;
        console.log('Application test starting ');
        expect(app.adapter).toBeDefined();
        expect(app.authManager).toBeDefined();
        expect(app.bot).toBeDefined();
        expect(app.conversationManager).toBeDefined();
        expect(app.graph).toBeDefined();
        expect(app.httpServer).toBeDefined();
        expect(app.mongoClient).toBeDefined();
        expect(app.users).toBeDefined();
        await app.close();
        console.log('Application test complete')
        done();
    })
});
