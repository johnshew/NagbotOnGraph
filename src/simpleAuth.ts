import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import * as fetch from 'node-fetch';
import { isDeepStrictEqual } from 'util';


class AuthTokens {
    auth_secret: string;  // random secret to share with the client.
    access_token: string;
    expires_on: Date;
    refresh_token: string;
    id_token: string;

    constructor(data: any) {
        if (!data.access_token || !data.expires_on || !data.id_token || !data.refresh_token || !data.auth_secret) throw new Error('Missing values for AuthToken');
        this.auth_secret = data.auth_secret;
        this.access_token = data.access_token;
        this.id_token = data.id_token;
        this.refresh_token = data.refresh_token;
        this.expires_on = data.expires_on;
    }
}
class JWT {
    oid?: string
}

function parseJwt (token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64,'base64').toString());
};

export async function generateSecretKey(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        randomBytes(48, (err, buf) => {
            if (err) return reject('Could not generate secret');
            return resolve(buf.toString('hex'));
        });
    });
}

export class AuthManager extends EventEmitter {

    private _tokensMap = new Map<string, AuthTokens>(); // UserAuthSecret to AuthTokens

    constructor(private appId: string, private appPassword: string, private defaultRedirectUri: string, private scopes: string[] = []) { super(); }

    getTokensFromUserAuthSecret(authSecret: string): AuthTokens | null {
        let tokens = this._tokensMap.get(authSecret);
        if (!tokens) return null;
        return tokens;
    }

    getJwtFromUserAuthSecret(authSecret: string)  {
        let tokens = this._tokensMap.get(authSecret);
        if (!tokens) return null;
        return <JWT>parseJwt(tokens.id_token);
    }

    setTokensForUserAuthSecret(authSecret: string, value: AuthTokens) {
        if (authSecret !== value.auth_secret) throw new Error('UserAuthSecret does not match');
        if (isDeepStrictEqual(this._tokensMap.get(authSecret), value)) {
            return
        }
        this._tokensMap.set(authSecret, value);
        this.emit('refreshed');
    }

    // gets code authorization redirect
    authUrl(state : string = ''): string {
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${this.appId}&response_type=code&redirect_uri=${this.defaultRedirectUri}&scope=${this.scopes.join('%20')}&state=${encodeURI(state)}`;
    }

    addScopes(scopes: string[]) {
        this.scopes.concat(scopes);
    }

    async getAccessToken(authSecret: string, resource?: string): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            try {
                let tokens = this._tokensMap.get(authSecret);
                if (!tokens) { return reject('No tokens for user. Not logged in.'); }
                if (tokens.access_token && tokens.expires_on && tokens.expires_on.valueOf() > Date.now()) { return resolve(tokens.access_token); }
                if (tokens.refresh_token) {
                    let tokens = await this.refreshTokens(authSecret);
                    return resolve(tokens.access_token);
                }
                return reject('Unable to refresh to get an access token.');
            }
            catch (err) { return reject('Could not get access token.  Reason: ' + err) }
        })
    }



    // gets tokens from authorization code
    async getUserAuthSecretFromCode(code: string): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            try {
                var body = `client_id=${this.appId}`;
                body += `&scope=${this.scopes.join('%20')}`;
                body += `&code=${code}`;
                body += `&redirect_uri=${this.defaultRedirectUri}`;
                body += `&grant_type=authorization_code&client_secret=${this.appPassword}`;

                var res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: body
                });
                if (res.status !== 200) { return reject('get token failed.'); }
                var data = await res.json();
                if (data['expires_in']) {
                    let expires = new Date(Date.now() + data['expires_in'] * 1000);
                    data['expires_on'] = expires.getTime();
                }
                data['auth_secret'] = await generateSecretKey();
                let tokens = new AuthTokens(data);
                this.setTokensForUserAuthSecret(tokens.auth_secret, tokens);
                return resolve(tokens.auth_secret);
            }
            catch (err) { return reject(err); }
        });
    }


    // updates access token using refresh token
    async refreshTokens(authSecret: string): Promise<AuthTokens> {
        return new Promise<AuthTokens>(async (resolve, reject) => {
            try {
                let tokens = this.getTokensFromUserAuthSecret(authSecret);
                if (!tokens) return reject('No token for that authSecret.');
                var body = `client_id=${this.appId}`;
                body += `&scope=${this.scopes.join('%20')}`;
                body += `&refresh_token=${tokens.refresh_token}`;
                body += `&redirect_uri=${this.defaultRedirectUri}`;
                body += `&grant_type=refresh_token&client_secret=${this.appPassword}`;

                var res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: body
                });
                if (res.status !== 200) { return reject('get token failed.'); }
                var data = await res.json();
                if (data['expires_in']) {
                    let expires = new Date(Date.now() + data['expires_in'] * 1000);
                    data['expires_on'] = expires.getTime();
                }
                data['auth_secret'] = tokens.auth_secret;
                let refreshedTokens = new AuthTokens(data);
                this.setTokensForUserAuthSecret(refreshedTokens.auth_secret, refreshedTokens);
                return resolve(refreshedTokens);
            }
            catch (err) { return reject(err); }
        });
    }
}

export declare interface AuthManager {
    on(event: 'refreshed', listener: () => void): this;
    emit(event: 'refreshed'): boolean
    // on(event: string, listener: Function): this;
    // emit(event: string | symbol, ...args : any[]) : boolean;
}
