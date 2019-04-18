import { ConversationReference } from 'botbuilder'
import { ConversationManager, compare } from '../conversations';

describe("Users", () => {
    test("simple", async (done) => {
        let conversations = new ConversationManager();
        let oid = '1234'
        expect(conversations.findAll(oid)).toHaveLength(0);

        let item: Partial<ConversationReference> = {
            serviceUrl: 'about:', channelId: "test",
            conversation: { isGroup: false, conversationType: 'foo', id: 'foo', name: 'foo', tenantId: 'foo' }
        }
        conversations.load(oid, [item]);
        expect(conversations.findAll(oid)).toHaveLength(1);
        expect(conversations.find(oid, (x) => compare(x, item))).toBeDefined();

        let called = false;
        conversations.on('updated', (oid, conversation) => { called = true });

        let altItem: Partial<ConversationReference> = { ...item, conversation: { ...item.conversation } };
        let altOid = '5678';
        conversations.addUnauthenticatedConversation('xyzzy', altItem);
        conversations.setOidForUnauthenticatedConversation('xyzzy', altOid);
        expect(called).toBe(true);
        expect(conversations.findAll(altOid)).toHaveLength(1);
        done();
    })
});
