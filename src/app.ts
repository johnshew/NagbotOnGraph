
import { app, create } from './nagbotApp';
import { startCollection } from './prometheus';
import { jaegerTracer, getContext, jaegerAppSpan, constants } from './jaeger'


getContext().run(() => {
    getContext().set(constants.tracer, jaegerTracer);
    getContext().set(constants.mainSpan, jaegerAppSpan);
    startCollection();
    create();
});



// For fiddler integration uncomment the following
// var globalTunnel = require('global-tunnel-ng');
// globalTunnel.initialize();
