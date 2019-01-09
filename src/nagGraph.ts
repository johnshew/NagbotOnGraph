import { default as app } from './app';
import { ConversationReference } from 'botbuilder';
import { OutlookTask, OpenTypeExtension }  from '@microsoft/microsoft-graph-types-beta';

export var nagExpand = "$expand=singleValueExtendedProperties($filter=id eq 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast' or id eq 'String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences')";
export var nagFilterNotCompletedAndNagMeCategory = "$filter=(status ne 'completed') and (categories/any(a:a eq 'NagMe'))";
export var nagFilterNagMeCategory = "$filter=(categories/any(a:a eq 'NagMe'))";

export async function StoreConversation(oid: string, conversation: Partial<ConversationReference>) {
    console.log(`oid: ${oid} and conversation: ${JSON.stringify(conversation)}`);

    let accessToken = await app.authManager.accessTokenForOid(oid);
    let data = <any> await app.graphHelper.get(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger');

    let conversations : any[] = data.conversations || [];
    
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
        await app.graphHelper.patch(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions/net.shew.nagger', data)
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
        let location = await app.graphHelper.post(accessToken, 'https://graph.microsoft.com/v1.0/me/extensions', data);
    } catch (err) {
        console.log(`post on user extension failed ${err}`);
        responseCode = err;
    }
}
