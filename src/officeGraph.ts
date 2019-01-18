import { default as fetch } from 'node-fetch';
import { ConversationReference } from 'botbuilder';

import { app } from './app';
import { OutlookTask } from '@microsoft/microsoft-graph-types-beta';

export class OfficeGraph {

    public async get<T>(accessToken: string, url: string): Promise<T> {
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
            return reject(response);
        });
    }

    public async patch(accessToken: string, url: string, body: any): Promise<void> {
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
                return resolve();
            }
            return reject(response);
        });
    }

    public async post(accessToken: string, url: string, body: any): Promise<string | null> {
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
                return resolve(response.headers.get('location'));
            }
            return reject(response);
        });
    }

    readonly Expand = "$expand=singleValueExtendedProperties($filter=id eq 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast' or id eq 'String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences')";
    readonly FilterNotCompletedAndNagMeCategory = "$filter=(status ne 'completed') and (categories/any(a:a eq 'NagMe'))";
    readonly FilterNagMeCategory = "$filter=(categories/any(a:a eq 'NagMe'))";

    public async  StoreConversation(oid: string, conversation: Partial<ConversationReference>) {

        // Will read then write.  No way to do a partial update on an extension.  Should be checking etags.

        console.log(`oid: ${oid} and conversation: ${JSON.stringify(conversation)}`);

        let accessToken = await app.authManager.accessTokenForOid(oid);
        let data = <any>await app.graph.get(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger');

        let conversations: any[] = data.conversations || [];

        let index = conversations.findIndex((v) => {
            if (v.conversation.id == conversation.conversation.id && v.user.id == conversation.user.id) return true;
        });

        if (index == -1) {
            conversations.push(conversation);
        } else {
            conversations[index] = conversation;
        }

        data.conversations = conversations;

        let responseCode: number | null = null;
        try {
            let accessToken = await app.authManager.accessTokenForOid(oid);
            await app.graph.patch(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger', data)
        }
        catch (err) {
            console.log(`patch on user extension failed ${err}`);
            responseCode = err;
        }

        if (responseCode == 404) try {
            responseCode = null;
            let accessToken = await app.authManager.accessTokenForOid(oid);
            data.extensionName = 'net.shew.nagger';
            data.id = 'net.shew.nagger'
            let location = await app.graph.post(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions', data);
        } catch (err) {
            console.log(`post on user extension failed ${err}`);
            responseCode = err;
        }
    }

    public async  LoadConversations(oid: string) {
        let accessToken = await app.authManager.accessTokenForOid(oid);
        let data = <any>await app.graph.get(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger');

        let conversations: any[] = data && data.conversations || [];
        return <Partial<ConversationReference>[]>conversations;
    }

    public async  getNagTasks(token: string): Promise<OutlookTask[]> {
        return new Promise<OutlookTask[]>(async (resolve, reject) => {
            try {
                let tasks = await app.graph.get<{ value: [OutlookTask] }>(token,
`https://graph.microsoft.com/beta/me/outlook/tasks?${app.graph.FilterNotCompletedAndNagMeCategory}&${app.graph.Expand}&`);
                return resolve(tasks ? tasks.value || [] : []);
            }
            catch (err) {
                return reject(err);
            }                
        });
    }
}
