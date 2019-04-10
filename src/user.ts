import { AuthTokens } from './simpleAuth';

export interface User {
    oid?: string;
    authKey?: string;
    preferredName?: string;
    authTokens?: AuthTokens;
};
