import http from 'node:http';
import { EVENTS } from '../../core/event-bus/events.js';
export class ApiServer {
    constructor(bus, host, port) {
        this.bus = bus;
        this.host = host;
        this.port = port;
        this.server = null;
        this.latest = {};
    }
    start() {
        this.bus.on(EVENTS.PROBABILITY, (event) => {
            this.latest.probability = event;
        });
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, (event) => {
            this.latest.signal = event;
        });
        this.bus.on(EVENTS.PORTFOLIO_UPDATE, (event) => {
            this.latest.portfolio = event;
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            this.latest.anomaly = event;
        });
        this.server = http.createServer((req, res) => {
            const path = req.url ?? '/';
            if (path === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, ts: Date.now() }));
                return;
            }
            if (path === '/state') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(this.latest));
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'not_found' }));
        });
        return new Promise((resolve, reject) => {
            this.server?.once('error', reject);
            this.server?.listen(this.port, this.host, () => resolve());
        });
    }
    stop() {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(() => resolve());
        });
    }
}
