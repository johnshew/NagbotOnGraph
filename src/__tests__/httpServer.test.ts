
jest.mock('../simpleAuth');
import { AuthContext, AuthManager } from '../simpleAuth';
const AuthManagerMocked = AuthManager as unknown as jest.Mock<AuthManager>;
AuthManagerMocked.mockImplementation((...args: any) => {
    return {
        getAccessToken: jest.fn<string, any>().mockImplementation(() => ''),
        getAccessTokenFromAuthKey: jest.fn<string, any>().mockImplementation(() => ''),
        getAuthContextFromAuthKey: jest.fn<AuthContext, any>().mockImplementation(() => null),
    } as unknown as AuthManager; // since not complete
});

jest.mock('../nagbotApp');
import { App } from '../nagbotApp';
const AppMocked = App as jest.Mock<App>;
AppMocked.mockImplementation((...args: any) => {
    const app: App = null;
    return {
        appHttpServer: undefined as unknown as typeof app.appHttpServer,
        authManager: new AuthManager('x', 'y', 'z'),
        botService: undefined as unknown as typeof app.botService,
        conversationManager: undefined as unknown as typeof app.conversationManager,
        graph: undefined as unknown as typeof app.graph,
        ready: Promise.resolve({} as App),
        timer: undefined as unknown as typeof app.timer,
        users: undefined as unknown as typeof app.users,

        close: jest.fn<Promise<void>, any>().mockResolvedValue(),
        start: jest.fn<Promise<App>, any>().mockResolvedValue(undefined as unknown as App),
    };
});

import { default as fetch } from 'node-fetch';
import { Server } from '../httpServer';

describe('Http Server', () => {
    let server: Server;

    beforeAll(async (done) => {
        server = new Server('8080');
        done();
    });

    test('loads app.html', async (done) => {
        const response = await fetch('http://localhost:8080');
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
