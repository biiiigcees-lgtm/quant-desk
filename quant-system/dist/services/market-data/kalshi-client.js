import { RiskError } from '../../core/index.js';
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 500;
export class KalshiClient {
    constructor(wsUrl, logger) {
        this.ws = null;
        this.messageHandlers = [];
        this.retryCount = 0;
        this.connectTimeout = null;
        this.url = wsUrl;
        this.logger = logger;
    }
    /**
     * Connect to Kalshi WebSocket with exponential backoff reconnect
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);
                this.ws.addEventListener('open', () => {
                    this.logger.info('Kalshi WS connected');
                    this.retryCount = 0;
                    clearTimeout(this.connectTimeout);
                    resolve();
                });
                this.ws.addEventListener('message', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.messageHandlers.forEach((handler) => handler(data));
                    }
                    catch (e) {
                        this.logger.warn('Failed to parse Kalshi message', { error: String(e) });
                    }
                });
                this.ws.addEventListener('close', () => {
                    this.logger.info('Kalshi WS closed');
                    this.reconnect();
                });
                this.ws.addEventListener('error', (event) => {
                    this.logger.error('Kalshi WS error', { error: event });
                    this.reconnect();
                });
                this.connectTimeout = setTimeout(() => {
                    reject(new RiskError('Kalshi WS connection timeout'));
                }, 10000);
            }
            catch (e) {
                reject(new RiskError('Failed to create Kalshi WS', { error: String(e) }));
            }
        });
    }
    reconnect() {
        if (this.retryCount >= MAX_RETRIES) {
            this.logger.error('Max Kalshi reconnect retries exceeded');
            return;
        }
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, this.retryCount);
        this.retryCount++;
        this.logger.info('Reconnecting Kalshi WS', { backoff, attempt: this.retryCount });
        setTimeout(() => {
            this.connect().catch((e) => this.logger.error('Reconnection attempt failed', { error: String(e) }));
        }, backoff);
    }
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    send(data) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
        else {
            this.logger.warn('Kalshi WS not open, message not sent');
        }
    }
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
        }
    }
    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}
