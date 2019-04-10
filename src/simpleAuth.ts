import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { default as fetch } from 'node-fetch';
import { isDeepStrictEqual } from 'util';


export class AuthTokens {
    auth_secret: string;  // random secret to share with the client.
    access_token: string;
    expires_on: Date;
    refresh_token: string;
    id_token: string;
    oid: string;

    constructor(data: any) {
        if (!data.access_token || !data.expires_on || !data.id_token || !data.refresh_token || !data.auth_secret) throw new Error('Missing values for AuthToken');
        this.auth_secret = data.auth_secret;
        this.access_token = data.access_token;
        this.id_token = data.id_token;
        this.refresh_token = data.refresh_token;
        this.expires_on = data.expires_on;
        this.oid = parseJwt(this.id_token).oid;
    }
}

class JWT {
    oid?: string
}

export class AuthManager extends EventEmitter {

    userAuthKeyToTokensMap = new Map<string, AuthTokens>(); // UserAuthKey to AuthTokens

    constructor(private appId: string, private appPassword: string, private defaultRedirectUri: string, private scopes: string[] = []) {
        super();
    }

    // clients of the authManager interact with it using userAuthKeys.  These contain no PII and can be shared with a client over protected channels.
    // clients get an authKey by redirecting to the authUrl and then obtaining a userAuthKey from redirect back that includes a 'code' on the query string parameter.

    authUrl(state: string = ''): string {
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${this.appId}&response_type=code&redirect_uri=${this.defaultRedirectUri}&scope=${this.scopes.join('%20')}&state=${encodeURI(state)}`;
    }

    async userAuthKeyFromCode(code: string): Promise<string> {
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
                this.setTokensForUserAuthKey(tokens.auth_secret, tokens);
                return resolve(tokens.auth_secret);
            }
            catch (err) { return reject(err); }
        });
    }

    jwtForUserAuthKey(authKey: string): JWT {
        let tokens = this.userAuthKeyToTokensMap.get(authKey);
        if (!tokens) return null;
        return parseJwt(tokens.id_token);
    }

    async accessTokenForAuthKey(authKey: string, resource?: string) {
        return new Promise<string>(async (resolve, reject) => {
            try {
                let tokens = this.userAuthKeyToTokensMap.get(authKey);
                if (!tokens) { return reject('No tokens for user. Not logged in.'); }
                if (tokens.access_token && tokens.expires_on && tokens.expires_on.valueOf() > Date.now()) { return resolve(tokens.access_token); }
                if (tokens.refresh_token) {
                    let tokens = await this.refreshTokens(authKey);
                    return resolve(tokens.access_token);
                }
                return reject('Unable to refresh to get an access token.');
            }
            catch (err) { return reject('Could not get access token.  Reason: ' + err) }
        })
    }

    async accessTokenForOid(oid: string) {
        for (const tokens of this.userAuthKeyToTokensMap.values()) {
            if (tokens.oid == oid) {
                if (tokens.access_token && tokens.expires_on && tokens.expires_on.valueOf() > Date.now()) { return tokens.access_token; }
                if (tokens.refresh_token) {
                    return (await this.getRefreshTokens(tokens)).access_token;
                }
            }
        }
        return null;
    }

    addScopes(scopes: string[]) {
        this.scopes.concat(scopes);
    }

    private getTokensForUserAuthKey(authKey: string): AuthTokens | null {
        let tokens = this.userAuthKeyToTokensMap.get(authKey);
        if (!tokens) return null;
        return tokens;
    }


    setTokensForUserAuthKey(authSecret: string, value: AuthTokens) {
        if (authSecret !== value.auth_secret) throw new Error('UserAuthSecret does not match');
        if (isDeepStrictEqual(this.userAuthKeyToTokensMap.get(authSecret), value)) {
            return
        }
        this.userAuthKeyToTokensMap.set(authSecret, value);
        this.emit('refreshed');
    }

    // updates access token using refresh token

    private async refreshTokens(authSecret: string): Promise<AuthTokens> {
        let tokens = this.getTokensForUserAuthKey(authSecret);
        if (!tokens) throw ('No token for that authSecret.');
        return this.getRefreshTokens(tokens)

    }

    private async getRefreshTokens(tokens: AuthTokens): Promise<AuthTokens> {
        return new Promise<AuthTokens>(async (resolve, reject) => {
            try {
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
                this.setTokensForUserAuthKey(refreshedTokens.auth_secret, refreshedTokens);
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

function parseJwt(token: string): JWT {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString());
};

export function generateSecretKey(length: number = 16): string {
    let buf = randomBytes(length);
    return buf.toString('hex');
}
