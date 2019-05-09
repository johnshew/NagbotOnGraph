
import { Server } from '../httpServer';
import { default as fetch } from 'node-fetch';

import { app, App, AppConfig } from '../app';

/*
const getAccessToken = jest.fn();
jest.mock('../simpleAuth', () => {
    return jest.fn().mockImplementation(() => {
        return { getAccessToken };
    });
});
*/

jest.mock('../app');

const appMocked = App as any as jest.Mock<App>;
appMocked.mockImplementation((...args: any) => {
    return {
        appHttpServer: jest.fn<typeof app.appHttpServer, any>(),
        authManager: jest.fn<typeof app.authManager, any>(),
        ready: jest.fn<Promise<typeof app>,any>().mockReturnThis(),
        users: jest.fn<typeof app.users, any>(),
        botService: jest.fn<typeof app.botService, any>(),
        conversationManager: jest.fn<typeof app.conversationManager, any>(),
        graph: jest.fn<typeof app.graph, any>(),
        timer: jest.fn<typeof app.timer, any>(),
        close: jest.fn<typeof app.close, any>()
    } as unknown as typeof app;
});


describe("Http Server", () => {
    test('empty', async (done)=>{
        await app.close();
        expect(app.close).toBeCalled();
        done();
    });
/*     let server;

    beforeAll(() => {
        server = new Server('8080');
    });

    test('confirm mocks', async (done) => {
        expect(app).toBeDefined();
        expect(AppConfig).toBeUndefined();
        expect(app.authManager).toBeDefined();
        done();
    });

    test("loads app.html", async (done) => {
        let response = await fetch('http://localhost:8080');
        expect(response.status).toBe(200);
        expect(response.url).toBe('http://localhost:8080/public/app.html');
        done();
    });

    test('redirects to login', async (done) => {
        let response = await fetch('http://localhost:8080/task/1234');
        expect(response.status).toBe(200);
        expect(response.url).toBe('http://localhost:8080/task/1234');
        let text = await response.text();
        expect(text).toContain('Are you logged in');
        done()
    });
*/
});
