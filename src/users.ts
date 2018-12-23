import { AuthTokens } from './simpleAuth';

export interface UserTracker {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens? : AuthTokens;
}
