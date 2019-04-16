import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { default as fetch } from 'node-fetch';
import { isDeepStrictEqual } from 'util';


export class AuthContext {
    authKey: string;  // random secret to share with the client.
    accessToken: string;
    expiresOn: Date;
    refreshToken: string;
    idToken: string;
    oid: string;

    constructor(data: any) {
        if (!data.access_token || !data.expires_on || !data.id_token || !data.refresh_token || !data.auth_secret) throw new Error('Missing values for AuthToken');
        this.authKey = data.auth_secret;
        this.accessToken = data.access_token;
        this.idToken = data.id_token;
        this.refreshToken = data.refresh_token;
        this.expiresOn = data.expires_on;
        this.oid = parseJwt(this.idToken).oid;
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

    async getAuthKeyFromCode(code: string): Promise<string> {
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
                let tokens = new AuthContext(data);
                await this.setAuthContext(tokens);
                return resolve(tokens.authKey);
            }
            catch (err) { return reject(err); }
        });
    }

    async getAccessTokenFromAuthKey(authKey: string) {
        let tokens = this.userAuthKeyToTokensMap.get(authKey);
        if (tokens && tokens.accessToken && tokens.expiresOn && tokens.expiresOn.valueOf() > Date.now()) { return tokens.accessToken; }
        if (tokens && tokens.refreshToken) {
            await this.refreshTokens(tokens);
            return tokens.accessToken;
        }
        throw new Error('Unable to acquire access_token');
    }
    async getAccessTokenFromOid(oid: string) {
        let tokens = [...this.userAuthKeyToTokensMap.values()].find((t) => t.oid == oid);
        if (!tokens && !tokens.authKey) throw 'oid not found';
        return this.getAccessTokenFromAuthKey(tokens.authKey);
    }

    getAuthContextFromAuthKey(authKey: string) {
        let tokens = this.userAuthKeyToTokensMap.get(authKey);
        if (!tokens) return null;
        return tokens;
    }

    async setAuthContext(value: AuthContext) {
        if (isDeepStrictEqual(this.userAuthKeyToTokensMap.get(value.authKey), value)) return;
        this.userAuthKeyToTokensMap.set(value.authKey, value);
        await this.getAccessTokenFromAuthKey(value.authKey); // forces refresh if needed
        this.emit('refreshed', value);
    }

    // updates access token using refresh token

    private async refreshTokens(tokens: AuthContext) {
        return new Promise<AuthContext>(async (resolve, reject) => {
            try {
                var body = `client_id=${this.appId}`;
                body += `&scope=${this.scopes.join('%20')}`;
                body += `&refresh_token=${tokens.refreshToken}`;
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
                data['auth_secret'] = tokens.authKey;
                let refreshedTokens = new AuthContext(data);
                await this.setAuthContext(refreshedTokens);
                return resolve();
            }
            catch (err) { return reject(err); }
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
}

class JWT {
    oid?: string
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
