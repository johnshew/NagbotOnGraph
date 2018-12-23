import { AuthTokens } from './simpleAuth';
import { UserTracker } from './nagbot';

export interface AppUser extends UserTracker {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens? : AuthTokens;
};
