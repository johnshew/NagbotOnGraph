import {  NagBot } from "./nagbot";
import { ConversationReference } from 'botbuilder';

export var nagExpand = "$expand=singleValueExtendedProperties($filter=id eq 'String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast' or id eq 'String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences')";
export var nagFilterNotCompletedAndNagMeCategory = "$filter=(status ne 'completed') and (categories/any(a:a eq 'NagMe'))";
export var nagFilterNagMeCategory = "$filter=(categories/any(a:a eq 'NagMe'))";

export function StoreConversation(oid : string, conversation : Partial<ConversationReference>) {
    console.log(`oid: ${oid} and conversation: ${JSON.stringify(conversation)}`);
}
