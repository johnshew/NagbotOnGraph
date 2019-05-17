
// Use the prom-client module to expose our metrics to Prometheus
import * as Prometheus from 'prom-client';
import * as restify from 'restify';
import { logger } from './utils'
import { response } from 'spdy';
const metricsPath = '/metrics'

export var numberOfRequests = new Prometheus.Counter({
    name: 'numOfRequests',
    help: 'number of requests',
    labelNames: ['method', 'path']
});

export var responses = new Prometheus.Summary({
    name: 'responses',
    help: 'response time in msec',
    labelNames: ['method', 'path', 'status']
});

export var startCollection = function () {
    console.log(logger`Starting the collection of metrics, the metrics are available on /metrics`);
    Prometheus.collectDefaultMetrics({ prefix: 'nagbot:' });
};

export function RequestCounters(req: restify.Request, res: restify.Response, next: restify.Next) {
    numberOfRequests.inc({ method: req.method, path: req.path() });
    next();
}

export function addResponseMetrics(server: restify.Server) {
    server.on('after', restify.plugins.metrics({ server: server }, (err, metrics, req, res, route) => {
            responses.labels(req.method, req.path(), res.statusMessage).observe(metrics.totalLatency);
    }));
}

export function addMetricsAPI(server: restify.Server) {
    server.get(metricsPath, (req, res, next) => {
        res.set('Content-Type', Prometheus.register.contentType);
        res.end(Prometheus.register.metrics());
        next();
    });
};