import { AuthTokens } from './simpleAuth';

export interface AppUser {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens? : AuthTokens;
}
