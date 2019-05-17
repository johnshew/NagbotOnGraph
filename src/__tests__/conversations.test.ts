import { ConversationReference } from 'botbuilder';
import { compare, ConversationManager } from '../conversations';

describe('Users', () => {
    test('simple', async (done) => {
        const conversations = new ConversationManager();
        const oid = '1234';
        expect(conversations.findAll(oid)).toHaveLength(0);

        const item: Partial<ConversationReference> = {
            channelId: 'test',
            conversation: { isGroup: false, conversationType: 'foo', id: 'foo', name: 'foo', tenantId: 'foo' },
            serviceUrl: 'about:',
        };
        conversations.load(oid, [item]);
        expect(conversations.findAll(oid)).toHaveLength(1);
        expect(conversations.find(oid, (x) => compare(x, item))).toBeDefined();

        let called = false;
        conversations.on('updated', (updateOid, conversation) => { called = true; });

        const altItem: Partial<ConversationReference> = { ...item, conversation: { ...item.conversation } };
        const altOid = '5678';
        conversations.addUnauthenticatedConversation('xyzzy', altItem);
        conversations.setOidForUnauthenticatedConversation('xyzzy', altOid);
        expect(called).toBe(true);
        expect(conversations.findAll(altOid)).toHaveLength(1);
        done();
    });
});
