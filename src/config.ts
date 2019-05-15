
import * as dotenv from 'dotenv';
import * as path from 'path';
import { logger } from './utils';
import { App } from './nagbotApp';

const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
const NODE_ENV = process.env.NODE_ENV || 'production';

export class AppConfig {
    static readonly appId = process.env.appId;
    static readonly appPassword = process.env.appPassword;
    static readonly mongoConnection = process.env.mongoConnection;
    static readonly httpLocalServerPort = process.env.port || process.env.PORT || '8080';
    static readonly publicServer = new URL("https://nagbotdev.shew.net");
    static readonly authPath = '/auth';
    static readonly authUrl = new URL(AppConfig.authPath, AppConfig.publicServer); 
    static readonly botLoginPath = '/bot-login';
    static readonly botLoginUrl = new URL(AppConfig.botLoginPath, AppConfig.publicServer).href;
    static readonly authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.ReadWrite', 'User.ReadWrite'];
    static readonly botPort = process.env.botport || process.env.BOTPORT || 3978;
    static readonly luisId = process.env.luisId;
    static readonly luisKey = process.env.luisKey;
    static readonly luisStaging = false;
    static readonly notificationCheckFrequencyMs = (NODE_ENV.toLowerCase().includes('development') ? 2 : 10) /* minutes */ * 60 * 1000;
    static readonly dueTodayPolicyIntervalMin = (NODE_ENV.toLowerCase().includes('development') ? 1 : 60); /* minutes */


    static check() : boolean {
        return AppConfig.appId && AppConfig.appPassword && AppConfig.mongoConnection && AppConfig.luisId && true;
    }
}


AppConfig.check();

console.log(logger`config NODE_ENV: ${NODE_ENV}`);
console.log(logger`config default botLoginUrl:  ${AppConfig.botLoginUrl}`);
console.log(logger`config notification check frequency: ${AppConfig.notificationCheckFrequencyMs}`);
console.log(logger`config "today" policy interval: " ${AppConfig.botLoginUrl}`);
