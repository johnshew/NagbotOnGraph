
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { default as fetch } from 'node-fetch';
import { isDeepStrictEqual } from 'util';

import { logger } from './utils';

export class AuthContext {
    authKey: string;  // random secret to share with the client.
    accessToken: string;
    expiresOn: Date;
    refreshToken: string;
    idToken: string;
    oid: string;

    loadFromToken(data: any) {
        if (!data.access_token || !data.expires_on || !data.id_token || !data.refresh_token || !data.auth_secret) {
            throw new Error('Missing values for AuthToken');
        }
        this.authKey = data.auth_secret;
        this.accessToken = data.access_token;
        this.idToken = data.id_token;
        this.refreshToken = data.refresh_token;
        this.expiresOn = new Date(data.expires_on);
        this.oid = parseJwt(this.idToken).oid;
        return this;
    }

    loadFromSerialized(data: any) {
        if (!data.authKey || !data.accessToken || !data.idToken || !data.refreshToken || !data.expiresOn || !data.oid) {
            throw new Error('Missing values for AuthToken');
        }
        this.authKey = data.authKey;
        this.accessToken = data.accessToken;
        this.idToken = data.idToken;
        this.refreshToken = data.refreshToken;
        this.expiresOn = (typeof data.expiresOn == 'string' && new Date(data.expiresOn)) || data.expiresOn;
        this.oid = data.oid;
        return this;
    }
}

export class AuthManager extends EventEmitter {

    private userAuthKeyToTokensMap = new Map<string, AuthContext>(); // UserAuthKey to AuthTokens

    constructor(private appId: string, private appPassword: string, private defaultRedirectUri: string, private scopes: string[] = []) {
        super();
    }

    // Clients of the authManager interact with it using an opaque AuthKey (string) or OID (string).  
    // The AuthKey doesn't contain any PII and can be shared with a client over protected channels.
    // Clients get an AuthKey by redirecting to the AuthUrl. This will redirect back to the web server.  On the redirect back you get the code from query string and ask for the users AuthKey.
    // Once you have an AuthKey you can get the OID.

    authUrl(state: string = ''): string {
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${this.appId}&response_type=code&redirect_uri=${this.defaultRedirectUri}&scope=${this.scopes.join('%20')}&state=${encodeURI(state)}`;
    }

    async newContextFromCode(code: string): Promise<AuthContext> {
        return new Promise(async (resolve, reject) => {
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
                if (res.status !== 200) { return reject(`get newContextFromCode failed.`); }
                var data = await res.json();
                if (data['expires_in']) {
                    let expires = new Date(Date.now() + data['expires_in'] * 1000);
                    data['expires_on'] = expires.getTime();
                }
                data['auth_secret'] = await generateSecretKey();
                let tokens = new AuthContext().loadFromToken(data);
                await this.setAuthContext(tokens);
                return resolve(tokens);
            }
            catch (err) {
                console.log(logger`error in getContextFromCode`, err);
                return reject(err);
            }
        });
    }

    async getAccessToken(context: AuthContext) {
        if (context && context.accessToken && context.expiresOn && context.expiresOn.valueOf() > Date.now().valueOf()) { return context.accessToken; }
        if (context && context.refreshToken) {
            await this.refreshTokens(context);
            return context.accessToken;
        }
        throw new Error('Unable to acquire access_token');
    }

    async getAccessTokenFromAuthKey(authKey: string) {
        let context = this.getAuthContextFromAuthKey(authKey);
        if (!context) throw 'authKey not found';
        return this.getAccessToken(context);
    }
    async getAccessTokenFromOid(oid: string) {
        let context = this.getAuthContextFromOid(oid);
        if (!context) throw 'oid not found';
        return this.getAccessToken(context);
    }

    getAuthContextFromAuthKey(authKey: string) { return this.userAuthKeyToTokensMap.get(authKey); }
    getAuthContextFromOid(oid: string) { return [...this.userAuthKeyToTokensMap.values()].find((t) => t.oid == oid); }

    async setAuthContext(context: AuthContext) {
        if (isDeepStrictEqual(this.userAuthKeyToTokensMap.get(context.authKey), context)) return;
        this.userAuthKeyToTokensMap.set(context.authKey, context);
        await this.getAccessToken(context); // forces refresh if needed
        this.emit('refreshed', context);
    }

    async loadAuthContext(data: any) {
        let context = new AuthContext().loadFromSerialized(data);
        this.userAuthKeyToTokensMap.set(context.authKey, context);
        await this.getAccessToken(context); // forces refresh if needed
        this.emit('loaded', context);
        return context;
    }

    // updates access token using refresh token
    async refreshTokens(context: AuthContext) {
        return new Promise<AuthContext>(async (resolve, reject) => {
            try {
                var body = `client_id=${this.appId}`;
                body += `&scope=${this.scopes.join('%20')}`;
                body += `&refresh_token=${context.refreshToken}`;
                body += `&redirect_uri=${this.defaultRedirectUri}`;
                body += `&grant_type=refresh_token&client_secret=${this.appPassword}`;

                var res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: body
                });
                if (res.status !== 200) {
                    return reject(`refresh token for failed with ${res.status} ${res.statusText} for user ${context.oid}`);
                }
                var data = await res.json();
                if (!data['expires_on'] && data['expires_in']) {
                    let expires = new Date(Date.now() + data['expires_in'] * 1000);
                    data['expires_on'] = expires.getTime();
                } else { throw new Error('no expiration data'); }
                data['auth_secret'] = context.authKey;
                let update = new AuthContext().loadFromToken(data);
                console.log(logger`refreshed token ${update.accessToken.substring(0, 20)} now expires ${update.expiresOn.toString()} in ${data.expires_in} seconds`);
                await this.setAuthContext(update);
                return resolve();
            }
            catch (err) {
                console.log(logger`error refreshing tokens`, err);
                return reject(err);
            }
        });
    }


    // Attic 

    private jwtForUserAuthKey(authKey: string): JWT {
        let tokens = this.userAuthKeyToTokensMap.get(authKey);
        if (!tokens) return null;
        return parseJwt(tokens.idToken);
    }

    private addScopes(scopes: string[]) {
        this.scopes.concat(scopes);
    }

}

export declare interface AuthManager {
    on(event: 'refreshed', listener: (authContext: AuthContext) => void): this;
    emit(event: 'refreshed', authContext: AuthContext): boolean
    on(event: 'loaded', listener: (authContext: AuthContext) => void): this;
    emit(event: 'loaded', authContext: AuthContext): boolean
}

interface JWT {
    oid?: string;
    preferred_username?: string;
    email?: string;
    name?: string;
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
