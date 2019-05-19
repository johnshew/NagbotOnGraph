import * as http from 'http';
import * as https from 'https';
import { initTracer } from 'jaeger-tracer-restify';
export { jaegarTracerMiddleware, makeSpan, requestWrapper, spanMaker, getContext, getInjectionHeaders  } from 'jaeger-tracer-restify';

// jaeger tracer middleware here
export const tracer = initTracer( 'nagbot', {
    reporter: {
        // host name of your
        agentHost: 'localhost',
    },
});
