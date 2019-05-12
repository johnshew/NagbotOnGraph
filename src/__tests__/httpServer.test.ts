
jest.mock('../simpleAuth');
import { AuthManager, AuthContext } from '../simpleAuth';
const AuthManagerMocked = AuthManager as unknown as jest.Mock<AuthManager>;
AuthManagerMocked.mockImplementation((...args: any) => {
    return {
        getAccessToken: jest.fn<string, any>().mockImplementation(() => { return '' }),
        getAccessTokenFromAuthKey: jest.fn<string, any>().mockImplementation(() => { return '' }),
        getAuthContextFromAuthKey: jest.fn<AuthContext, any>().mockImplementation(() => { return null }),
    } as unknown as AuthManager; // since not complete
});

jest.mock('../nagbotApp');
import { App } from '../nagbotApp';
const AppMocked = <jest.Mock<App>>App;
AppMocked.mockImplementation((...args: any) => {
    let app: App;
    return {
        ready: Promise.resolve({} as App),
        appHttpServer: undefined as unknown as typeof app.appHttpServer,
        authManager: new AuthManager('x','y','z'),
        botService: undefined as unknown as typeof app.botService,
        conversationManager: undefined as unknown as typeof app.conversationManager,
        users: undefined as unknown as typeof app.users,
        graph: undefined as unknown as typeof app.graph,
        timer: undefined as unknown as typeof app.timer,

        start: jest.fn<Promise<App>, any>().mockResolvedValue(undefined as unknown as App),
        close: jest.fn<Promise<void>, any>().mockResolvedValue()
    };
});

import { Server } from '../httpServer';
import { default as fetch } from 'node-fetch';
import { doesNotReject } from 'assert';


describe("Http Server", () => {
    let server: Server;

    beforeAll(async (done) => {
        server = new Server('8080');
        done();
    });

    test("loads app.html", async (done) => {
        let response = await fetch('http://localhost:8080');
        expect(response.status).toBe(200);
        expect(response.url).toBe('http://localhost:8080/public/app.html');
        done();
    });

    afterAll(async (done) => {
        await server.asyncClose();
        done();
    });

    /* Need to mock office graph

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
