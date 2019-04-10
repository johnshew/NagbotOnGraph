// Note that normally will never be called.  It is useful for a quick check on app initialization and module load debugging.

import { app } from './app';

async function test() {
    await app.ready;
    console.log(app);
}

test();