
import * as dotenv from 'dotenv';
import * as path from 'path';
const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });

export class AppConfig {
    static readonly appId = process.env.appId;
    static readonly appPassword = process.env.appPassword;
    static readonly mongoConnection = process.env.mongoConnection;
    static readonly httpLocalServerPort = process.env.port || process.env.PORT || '8080';
    static readonly publicServer = new URL("https://nagbotdev.shew.net");
    static readonly authPath = '/auth';
    static readonly authUrl = new URL(AppConfig.authPath, AppConfig.publicServer); // AppConfig.publicServer.href + AppConfig.authPath;
    static readonly botLoginPath = '/bot-login';
    static readonly botLoginUrl = AppConfig.publicServer.href + AppConfig.botLoginPath
    static readonly authDefaultScopes = ['openid', 'offline_access', 'profile', 'Mail.Read', 'Tasks.ReadWrite', 'User.ReadWrite'];
    static readonly botPort = process.env.botport || process.env.BOTPORT || 3978;
    static readonly luisId = process.env.luisId;
    static readonly luisKey = process.env.luisKey;
    static readonly luisStaging = false;
    static readonly notificationCheckFrequency = 1 /* minutes */ * 60 * 1000;
    static readonly dueTodayPolicyInterval = 2; /* minutes */


    static check() : boolean {
        return AppConfig.appId && AppConfig.appPassword && AppConfig.mongoConnection && AppConfig.luisId && true;
    }
}
