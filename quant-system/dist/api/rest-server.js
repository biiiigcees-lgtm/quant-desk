import http from 'http';
export class RestServer {
    constructor(host, port, providers, streamServer) {
        this.server = null;
        this.host = host;
        this.port = port;
        this.providers = providers;
        this.streamServer = streamServer;
    }
    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => this.handleRequest(req, res));
            this.server.on('error', reject);
            this.server.listen(this.port, this.host, () => resolve());
        });
    }
    stop() {
        return new Promise((resolve) => {
            this.streamServer.closeAll();
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(() => resolve());
        });
    }
    handleRequest(req, res) {
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
    sendJson(res, code, payload) {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
    }
}
