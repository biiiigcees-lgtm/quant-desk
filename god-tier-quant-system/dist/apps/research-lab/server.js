import http from 'node:http';
import { EVENTS } from '../../core/event-bus/events.js';
export class ResearchLabServer {
    constructor(bus, host, port) {
        this.bus = bus;
        this.host = host;
        this.port = port;
        this.server = null;
        this.notes = [];
    }
    start() {
        this.bus.on(EVENTS.RESEARCH_NOTE, (note) => {
            this.notes.unshift(note);
            if (this.notes.length > 100) {
                this.notes.pop();
            }
        });
        this.server = http.createServer((req, res) => {
            const path = req.url ?? '/';
            if (path === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, ts: Date.now() }));
                return;
            }
            if (path === '/notes') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ notes: this.notes.slice(0, 25) }));
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
