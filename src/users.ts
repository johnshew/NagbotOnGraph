import { AuthTokens } from './simpleAuth';
import { UserStatus } from './nagbot';

export interface AppUser extends UserStatus {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens? : AuthTokens;
};
