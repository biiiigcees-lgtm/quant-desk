import http, { IncomingMessage, ServerResponse } from 'http';
import { AggregatedSignal, Order, PortfolioState, Position } from '../core/index.js';
import { EventStreamServer } from './websocket-server.js';

export interface ApiStateProviders {
  getPortfolio: () => PortfolioState | null;
  getOrders: () => Order[];
  getPositions: () => Position[];
  getLatestSignal: () => AggregatedSignal | null;
}

export class RestServer {
  private server: http.Server | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly providers: ApiStateProviders;
  private readonly streamServer: EventStreamServer;

  constructor(host: string, port: number, providers: ApiStateProviders, streamServer: EventStreamServer) {
    this.host = host;
    this.port = port;
    this.providers = providers;
    this.streamServer = streamServer;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.streamServer.closeAll();
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '/';

    if (url === '/stream') {
      this.streamServer.handleSseRequest(req, res);
      return;
    }

    if (url === '/health') {
      this.sendJson(res, 200, { ok: true, timestamp: Date.now() });
      return;
    }

    if (url === '/portfolio') {
      this.sendJson(res, 200, this.providers.getPortfolio());
      return;
    }

    if (url === '/orders') {
      this.sendJson(res, 200, this.providers.getOrders());
      return;
    }

    if (url === '/positions') {
      this.sendJson(res, 200, this.providers.getPositions());
      return;
    }

    if (url === '/signal') {
      this.sendJson(res, 200, this.providers.getLatestSignal());
      return;
    }

    this.sendJson(res, 404, { error: 'Not Found' });
  }

  private sendJson(res: ServerResponse, code: number, payload: unknown): void {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }
}
