
import { Server } from '../httpServer';
import { default as fetch } from 'node-fetch';
import { app, AppConfig } from '../app';

const getAccessToken = jest.fn();
jest.mock('../simpleAuth', () => {
  return jest.fn().mockImplementation(() => {
    return { getAccessToken };
  });
});

const authManager = jest.fn();
let myMockedApp = jest.mock('../app');
myMockedApp.

() => {
    return jest.fn().mockImplementation(()=>{
        return { 
            app: { authManager}, 
        AppConfig : {}
    };
    });
});

describe("Http Server", () => {
    let server;
    beforeAll(()=>{
        server= new Server('8080');
    });

    test('confirm mocks', async(done)=>{
        expect(app).toBeDefined();
        expect(AppConfig).toBeUndefined();
        expect(app.authManager).toBeDefined();
        done();
    });

    test("loads app.html", async(done) => {
        let response = await fetch('http://localhost:8080');
        expect(response.status).toBe(200);
        expect(response.url).toBe('http://localhost:8080/public/app.html');
        done();
    });

    test('redirects to login', async(done)=>{
        let response = await fetch('http://localhost:8080/task/1234');
        expect(response.status).toBe(200);
        expect(response.url).toBe('http://localhost:8080/task/1234');
        let text = await response.text();
        expect(text).toContain('Are you logged in');
        done()
    });
    
});
