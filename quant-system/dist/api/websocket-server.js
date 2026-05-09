export class EventStreamServer {
    constructor() {
        this.clients = new Set();
    }
    handleSseRequest(_req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache',
        });
        res.write('\n');
        this.clients.add(res);
        res.on('close', () => {
            this.clients.delete(res);
        });
    }
    broadcast(event, payload) {
        const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        for (const client of this.clients) {
            client.write(line);
        }
    }
    closeAll() {
        for (const client of this.clients) {
            client.end();
        }
        this.clients.clear();
    }
}
