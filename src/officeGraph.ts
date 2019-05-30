import { OutlookTask, User } from '@microsoft/microsoft-graph-types-beta';
import { default as fetch } from 'node-fetch';
import { IConversation } from './conversations';
import { logger, sleep } from './utils';
export { OutlookTask, User } from '@microsoft/microsoft-graph-types-beta';

export class OfficeGraph {

    public readonly graphUrl = 'https://graph.microsoft.com/v1.0';
    public readonly graphUrlBeta = 'https://graph.microsoft.com/beta';
    public readonly filterNotCompletedAndNagMeCategory = "$filter=(status ne 'completed') and (categories/any(a:a eq 'NagMe'))";
    public readonly filterNagMeCategory = "$filter=(categories/any(a:a eq 'NagMe'))";
    public readonly propertyNagLast = 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast';
    public readonly propertyNagPreferences = 'String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences';  // !!! for now just a policy string.
    public readonly queryExpandNagExtensions = `$expand=singleValueExtendedProperties($filter=id eq '${this.propertyNagLast}' or id eq '${this.propertyNagPreferences}')`;
    public readonly emptyNagExtensions: OutlookTask = {
        singleValueExtendedProperties: [{
            id: 'String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences',
            value: '',
        }, {
            id: 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast',
            value: '',
        }],
    };

    public async get<T>(accessToken: string, url: string): Promise<T> {
        console.log(logger`GET ${url} with token ending in ${accessToken}`);
        return new Promise<T>(async (resolve, reject) => {
            let response;
            try {
                response = await fetch(url, {
                    headers: {
                        Accept: 'application/json',
                        Authorization: 'Bearer ' + accessToken,
                    },
                });
                console.log(logger`GET response ${response.statusText}`);
                if (response.status === 200 || response.status === 204) {
                    const data = await response.json();
                    console.log(data);
                    return resolve(data);
                }
            } catch (err) { console.log(logger`GET error`, err); }
            return reject(new Error(`GET for ${url} failed with ${response.status} ${response.statusText}`));
        });
    }

    public async getWithRetry<T>(accessToken: string, url: string, count = 5, delayMs = 1000): Promise<T> {
        console.log(logger`GET retry called`);
        let error;
        for (let i = 0; i < count; i++) {
            try {
                const result = await this.get<T>(accessToken, url);
                return result;
            } catch (err) {
                error = err;
                console.log(logger`caught GET error.`, err);
            }
            console.log(logger`retrying ${i + 1}`);
            await sleep(delayMs);
            delayMs *= 2;
        }
        throw error;
    }

    public async patch(accessToken: string, url: string, body: any): Promise<any> {
        return new Promise<any>(async (resolve, reject) => {
            const options = {
                body: JSON.stringify(body),
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                },
                method: 'patch',
            };
            try {
                const response = await fetch(url, options);
                if (response.status === 200) {
                    const json = await response.json();
                    return resolve(json);
                } else if (response.status === 204) {
                    return resolve(null);
                }
                return reject(new Error(`PATCH failed with ${response.status} ${response.statusText} and token ${accessToken.substring(0, 5)}`));
            } catch (err) {
                console.log(logger`PATCH failed`, err);
                return reject(err);
            }
        });
    }

    public async post(accessToken: string, url: string, body: any): Promise<any> {
        return new Promise<string | null>(async (resolve, reject) => {
            const options = {
                body: JSON.stringify(body),
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                },
                method: 'post',
            };
            const response = await fetch(url, options);
            if (response.status === 201 || response.status === 200 || response.status === 204) {
                const updated = await response.json();
                return resolve(updated);
            }
            return reject(new Error(`POST failed with ${response.status} ${response.statusText} and token ${accessToken.substring(0, 5)}`));
        });
    }

    public async setConversations(accessToken: string, conversations: IConversation[]) {
        try {
            const data = { id: 'net.shew.nagger', conversations };
            await this.patch(accessToken, `${this.graphUrl}/me/extensions/net.shew.nagger`, data);
            return;
        } catch (err) {
            console.log(logger`patch on user extension failed ${err} so trying post`);
        }
        try {
            const data = { extensionName: 'net.shew.nagger', id: 'net.shew.nagger', conversations };
            const location = await this.post(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions', data);
        } catch (err) {
            throw new Error(`setConversation failed with error ${err} and token ${accessToken.substring(0, 5)}`);
        }
    }

    public async getConversations(accessToken: string) {
        const data = await this.getWithRetry<IConversation>(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger')
            .catch((reason) => Promise.resolve(null));
        const conversations: any[] = data && data.conversations || [];
        return conversations;
    }

    public async findTasks(token: string): Promise<OutlookTask[]> {
        return new Promise<OutlookTask[]>(async (resolve, reject) => {
            try {
                const tasks = await this.getWithRetry<{ value: [OutlookTask] }>(token,
                    `${this.graphUrlBeta}/me/outlook/tasks?${this.filterNotCompletedAndNagMeCategory}&${this.queryExpandNagExtensions}`);
                return resolve(tasks.value || []);
            } catch (err) {
                return reject(err);
            }
        });
    }

    public async insertTask(token: string, task: OutlookTask): Promise<OutlookTask> {
        const data = { ...task, ...this.emptyNagExtensions };
        if (!data.categories) { data.categories = []; }
        if (!data.categories.find((value) => (value === 'NagMe'))) { data.categories.push('NagMe'); }
        const result = await this.post(token, 'https://graph.microsoft.com/beta/me/outlook/tasks', data);
        return result;
    }

    public async updateTask(token: string, task: OutlookTask) {
        const data = { ...this.emptyNagExtensions, ...task };
        await this.patch(token, `https://graph.microsoft.com/beta/me/outlook/tasks/${task.id}`, data);
        console.log(logger`updated task ${task.subject}`);
    }

    public async getProfile(token: string) {
        const user = await this.get<User>(token, `${this.graphUrl}/me`);
        return user;
    }
}
