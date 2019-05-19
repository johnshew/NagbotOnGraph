
import { app, create } from './nagbotApp';
import { startCollection } from './prometheus';


startCollection();
create();

// For fiddler integration uncomment the following
// var globalTunnel = require('global-tunnel-ng');
// globalTunnel.initialize();
