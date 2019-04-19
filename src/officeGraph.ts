import { default as fetch } from 'node-fetch';
import { ConversationReference } from 'botbuilder';

import { app } from './app';
import { OutlookTask } from '@microsoft/microsoft-graph-types-beta';
export { OutlookTask } from '@microsoft/microsoft-graph-types-beta';

export class OfficeGraph {

    async get<T>(accessToken: string, url: string): Promise<T> {
        return new Promise<T>(async (resolve, reject) => {
            let response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                }
            });
            if (response.status == 200 || response.status == 204) {
                let data = await response.json();
                return resolve(data);
            }
            return reject(new Error(`GET for ${url} failed with ${response.status} ${response.statusText} and token ${accessToken.substring(0, 5)}`));
        });
    }

    async patch(accessToken: string, url: string, body: any) {
        return new Promise<void>(async (resolve, reject) => {
            let options = {
                method: 'patch',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                },
                body: JSON.stringify(body)
            }
            let response = await fetch(url, options);
            if (response.status == 200 || response.status == 204) {
                let json = await response.json();
                return resolve(json);
            }
            return reject(new Error(`PATCH failed with ${response.status} ${response.statusText} and token ${accessToken.substring(0, 5)}`));
        });
    }

    async post(accessToken: string, url: string, body: any): Promise<any> {
        return new Promise<string | null>(async (resolve, reject) => {
            let options = {
                method: 'post',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                },
                body: JSON.stringify(body)
            }
            let response = await fetch(url, options);
            if (response.status == 201 || response.status == 200 || response.status == 204) {
                let url = response.headers.get('location');
                let updated = await response.json();
                return resolve(updated);
            }
            return reject(new Error(`POST failed with ${response.status} ${response.statusText} and token ${accessToken.substring(0, 5)}`));
        });
    }

    readonly FilterNotCompletedAndNagMeCategory = "$filter=(status ne 'completed') and (categories/any(a:a eq 'NagMe'))";
    readonly FilterNagMeCategory = "$filter=(categories/any(a:a eq 'NagMe'))";
    readonly PropertyNagLast = 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast';
    readonly PropertyNagPreferences = 'String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences';  //!!! for now just a policy string.
    readonly ExpandNagExtensions = `$expand=singleValueExtendedProperties($filter=id eq '${this.PropertyNagLast}' or id eq '${this.PropertyNagPreferences}')`;
    readonly NagExtensions: OutlookTask = {
        singleValueExtendedProperties: [{
            id: "String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences",
            value: ''
        }, {
            id: "String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast",
            value: ''
        }]
    };

    async setConversations(oid: string, conversations: Partial<ConversationReference>[]) {
        let accessToken = await app.authManager.getAccessTokenFromOid(oid);
        try {
            let data = { id: 'net.shew.nagger', conversations };
            await app.graph.patch(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger', data);
            return;
        }
        catch (err) {
            console.log(`patch on user extension failed ${err} so trying post`);
        }
        try {
            let data = { extensionName: "net.shew.nagger", id: "net.shew.nagger", conversations };
            let location = await app.graph.post(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions', data);
        } catch(err) {
            throw new Error(`setConversation failed with error ${err} and token ${accessToken.substring(0, 5)}`);
        }
    }

    async getConversations(oid: string) {
        let accessToken = await app.authManager.getAccessTokenFromOid(oid);
        let data = <any>await app.graph.get(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger').catch((reason)=>Promise.resolve(null));
        let conversations : any[] = data && data.conversations || [];
        return <Partial<ConversationReference>[]>conversations;
    }

    async findTasks(token: string): Promise<OutlookTask[]> {
        return new Promise<OutlookTask[]>(async (resolve, reject) => {
            try {
                let tasks = await app.graph.get<{ value: [OutlookTask] }>(token,
                    `https://graph.microsoft.com/beta/me/outlook/tasks?${app.graph.FilterNotCompletedAndNagMeCategory}&${app.graph.ExpandNagExtensions}&`);
                return resolve(tasks.value || []);
            }
            catch (err) {
                return reject(err);
            }
        });
    }

    async insertTask(token: string, task: OutlookTask): Promise<OutlookTask> {
        let data = { ...task, ...this.NagExtensions };
        if (!data.categories) data.categories = [];
        if (!data.categories.find((value) => (value == "NagMe"))) data.categories.push("NagMe");
        let result = await this.post(token, `https://graph.microsoft.com/beta/me/outlook/tasks`, data);
        return result;
    }

    async updateTask(token: string, task: OutlookTask) {
        let data = { ...this.NagExtensions, ...task };
        await this.patch(token, `https://graph.microsoft.com/beta/me/outlook/tasks/${task.id}`, data);
        console.log(`Updated task ${task.subject}`)
    }
}