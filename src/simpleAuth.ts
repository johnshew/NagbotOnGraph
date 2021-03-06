
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { default as fetch } from 'node-fetch';
import { isDeepStrictEqual } from 'util';

import { logger } from './utils';

export class AuthContext {
    public authKey: string;  // random secret to share with the client.
    public accessToken: string;
    public expiresOn: Date;
    public refreshToken: string;
    public idToken: string;
    public oid: string;

    public loadFromToken(data: any) {
        if (!data.access_token || !data.expires_in || !data.id_token || !data.refresh_token || !data.auth_secret) {
            throw new Error('Missing values for AuthToken');
        }
        this.authKey = data.auth_secret;
        this.accessToken = data.access_token;
        this.idToken = data.id_token;
        this.refreshToken = data.refresh_token;
        this.expiresOn = new Date(Date.now() + data.expires_in * 1000);
        this.oid = parseJwt(this.idToken).oid;
        return this;
    }

    public loadFromSerialized(data: any) {
        if (!data.authKey || !data.accessToken || !data.idToken || !data.refreshToken || !data.expiresOn || !data.oid) {
            throw new Error('Missing values for AuthToken');
        }
        this.authKey = data.authKey;
        this.accessToken = data.accessToken;
        this.idToken = data.idToken;
        this.refreshToken = data.refreshToken;
        this.expiresOn = (typeof data.expiresOn === 'string' && new Date(data.expiresOn)) || data.expiresOn;
        this.oid = data.oid;
        return this;
    }
}

export class AuthManager extends EventEmitter {

    public userAuthKeyToTokensMap = new Map<string, AuthContext>(); // UserAuthKey to AuthTokens

    constructor(private appId: string, private appPassword: string, private redirectUrl: string = 'error', private scopes: string[] = []) {
        super();
    }

    // Clients of the authManager interact with it using an opaque AuthKey (string) or OID (string).
    // The AuthKey doesn't contain any PII and can be shared with a client over protected channels.
    // Clients get an AuthKey by redirecting to the AuthUrl. This will redirect back to the web server.  On the redirect back you get the code from query string and ask for the users AuthKey.
    // Once you have an AuthKey youoptions can get the OID.

    public authUrl({ state, redirect }: { state?: string, redirect?: string } = { state: '' }) {
        if (redirect) { this.redirectUrl = redirect; }
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${this.appId}&response_type=code&redirect_uri=${this.redirectUrl}&scope=${this.scopes.join('%20')}&state=${encodeURI(state)}`;
    }

    public async newContextFromCode(code: string, redirect?: string): Promise<AuthContext> {
        if (redirect) { this.redirectUrl = redirect; }
        return new Promise(async (resolve, reject) => {
            try {
                let body = `client_id=${this.appId}`;
                body += `&scope=${this.scopes.join('%20')}`;
                body += `&code=${code}`;
                body += `&redirect_uri=${this.redirectUrl}`;
                body += `&grant_type=authorization_code&client_secret=${this.appPassword}`;

                const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body,
                });

                if (res.status !== 200) {
                    let resultBody = ''; let chunk = null;
                    // tslint:disable-next-line: no-conditional-assignment
                    while (chunk = res.body.read()) {
                        resultBody += chunk;
                    }
                    console.log(logger`get newContextFromCode returned.`, res.statusText, resultBody);
                    return reject('get newContextFromCode failed.');
                }
                const data = await res.json();
                if (data.expires_in) {
                    const expires = new Date(Date.now() + data.expires_in * 1000);
                } else { throw new Error('No expires_in date'); }
                data.auth_secret = await generateSecretKey();
                const tokens = new AuthContext().loadFromToken(data);
                console.log(logger`refreshed token ${tokens.accessToken.substring(0, 20)} now expires ${tokens.expiresOn.toString()}`);
                await this.setAuthContext(tokens);
                return resolve(tokens);
            } catch (err) {
                console.log(logger`error in getContextFromCode`, err);
                return reject(err);
            }
        });
    }

    public async getAccessToken(context: AuthContext) {
        if (context && context.accessToken && context.expiresOn && context.expiresOn.valueOf() > Date.now().valueOf()) { return context.accessToken; }
        if (context && context.refreshToken) {
            await this.refreshTokens(context);
            return this.userAuthKeyToTokensMap.get(context.authKey).accessToken;
        }
        throw new Error('Unable to acquire access_token');
    }

    public async getAccessTokenFromAuthKey(authKey: string) {
        const context = this.getAuthContextFromAuthKey(authKey);
        if (!context) { throw new Error('authKey not found'); }
        return this.getAccessToken(context);
    }
    public async getAccessTokenFromOid(oid: string) {
        const context = this.getAuthContextFromOid(oid);
        if (!context) { throw new Error('oid not found'); }
        return this.getAccessToken(context);
    }

    public getAuthContextFromAuthKey(authKey: string) { return this.userAuthKeyToTokensMap.get(authKey); }
    public getAuthContextFromOid(oid: string) { return [...this.userAuthKeyToTokensMap.values()].find((t) => t.oid === oid); }

    public async setAuthContext(context: AuthContext, refresh = true) {
        if (isDeepStrictEqual(this.userAuthKeyToTokensMap.get(context.authKey), context)) { return; }
        this.userAuthKeyToTokensMap.set(context.authKey, context);
        if (refresh) { await this.getAccessToken(context); } // forces refresh if needed
        this.emit('refreshed', context);
    }

    public async loadAuthContext(data: any) {
        const context = new AuthContext().loadFromSerialized(data);
        this.userAuthKeyToTokensMap.set(context.authKey, context);
        await this.getAccessToken(context); // forces refresh if needed
        this.emit('loaded', context);
        return context;
    }

    // updates access token using refresh token
    public async refreshTokens(context: AuthContext) {
        return new Promise<AuthContext>(async (resolve, reject) => {
            try {
                let body = `client_id=${this.appId}`;
                body += `&scope=${this.scopes.join('%20')}`;
                body += `&refresh_token=${context.refreshToken}`;
                body += `&redirect_uri=${this.redirectUrl}`;
                body += `&grant_type=refresh_token&client_secret=${this.appPassword}`;

                const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body,
                });
                if (res.status !== 200) {
                    let resBody = ''; let chunk;
                    // tslint:disable-next-line: no-conditional-assignment
                    while (chunk = res.body.read()) { resBody += chunk; }
                    console.error(logger`refresh Token failed`, res.statusText, resBody);
                    return reject(`refresh token for failed with ${res.status} ${res.statusText} for user ${context.oid}`);
                }
                const data = await res.json();
                if (data.expires_in) {
                    const expires = new Date(Date.now() + data.expires_in * 1000);
                } else { throw new Error('no expiration data'); }
                data.auth_secret = context.authKey;
                const update = new AuthContext().loadFromToken(data);
                console.log(logger`refreshed token ${update.accessToken.substring(0, 20)} now expires ${update.expiresOn.toString()}`);
                await this.setAuthContext(update, false);
                return resolve(update);
            } catch (err) {
                console.log(logger`error refreshing tokens`, err);
                return reject(err);
            }
        });
    }

    // Attic

    private jwtForUserAuthKey(authKey: string): JWT {
        const tokens = this.userAuthKeyToTokensMap.get(authKey);
        if (!tokens) { return null; }
        return parseJwt(tokens.idToken);
    }

    private addScopes(scopes: string[]) {
        this.scopes.concat(scopes);
    }

}

/* tslint:disable:interface-name */
export declare interface AuthManager {
    on(event: 'refreshed' | 'loaded', listener: (authContext: AuthContext) => void): this;
    emit(event: 'refreshed' | 'loaded', authContext: AuthContext): boolean;
}

interface JWT {
    oid?: string;
    preferred_username?: string;
    email?: string;
    name?: string;
}

function parseJwt(token: string): JWT {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString());
}

export function generateSecretKey(length: number = 16): string {
    const buf = randomBytes(length);
    return buf.toString('hex');
}
