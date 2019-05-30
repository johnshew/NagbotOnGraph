
import { User, Users } from '../users';

describe('Users', () => {
    test('simple', async (done) => {
        const users = new Users();
        expect(users.get('xyzzy')).toBeUndefined();
        await expect(users.set('xyzzy', { oid: 'xyzzy' })).resolves;
        expect(users.get('xyzzy')).toBeDefined();
        done();
    });
});
