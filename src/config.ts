
import * as dotenv from 'dotenv';
import * as path from 'path';
import { logger } from './utils';

const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
const NODE_ENV = process.env.NODE_ENV || 'production';
const DEPLOYMENT_ENV = process.env.DEPLOYMENT_ENV || 'local'

export class AppConfig {
    public static readonly appId = process.env.appId;
    public static readonly appPassword = process.env.appPassword;
    public static readonly mongoConnection = process.env.mongoConnection;
    public static readonly httpLocalServerPort = process.env.port || process.env.PORT || '8080';
    public static readonly publicServer = (DEPLOYMENT_ENV == 'local') ? new URL(`http://localhost${AppConfig.httpLocalServerPort}`) :
            (DEPLOYMENT_ENV == 'dev') ? new URL('https://nagbotdev.shew.net') :  new URL('https://nagbot.shew.net')
    public static readonly authPath = '/auth';
    public static readonly authUrl = new URL(AppConfig.authPath, AppConfig.publicServer);
    public static readonly botLoginPath = '/bot-login';
    public static readonly botLoginUrl = new URL(AppConfig.botLoginPath, AppConfig.publicServer).href;
    public static readonly authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.ReadWrite', 'User.ReadWrite'];
    public static readonly botPort = process.env.botport || process.env.BOTPORT || 3978;
    public static readonly luisId = process.env.luisId;
    public static readonly luisKey = process.env.luisKey;
    public static readonly luisStaging = false;
    public static readonly notificationCheckFrequencyMs = (NODE_ENV.toLowerCase().includes('development') ? 2 : 10) /* minutes */ * 60 * 1000;
    public static readonly dueTodayPolicyIntervalMin = (NODE_ENV.toLowerCase().includes('development') ? 1 : 60); /* minutes */

    public static check(): boolean {
        return AppConfig.appId && AppConfig.appPassword && AppConfig.mongoConnection && AppConfig.luisId && true;
    }
}

AppConfig.check();

console.log(logger`config NODE_ENV: ${NODE_ENV}`);
console.log(logger`config default botLoginUrl:  ${AppConfig.botLoginUrl}`);
console.log(logger`config notification check frequency: ${AppConfig.notificationCheckFrequencyMs / 1000 / 60}`);
console.log(logger`config "today" policy interval: ${AppConfig.dueTodayPolicyIntervalMin}`);