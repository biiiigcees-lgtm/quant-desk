import http from 'node:http';
import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';

export class ResearchLabServer {
  private server: http.Server | null = null;
  private readonly notes: Array<{ title: string; body: string; tags: string[]; timestamp: number }> = [];

  constructor(private readonly bus: EventBus, private readonly host: string, private readonly port: number) {}

  start(): Promise<void> {
    this.bus.on(EVENTS.RESEARCH_NOTE, (note) => {
      this.notes.unshift(note as { title: string; body: string; tags: string[]; timestamp: number });
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

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }
}
