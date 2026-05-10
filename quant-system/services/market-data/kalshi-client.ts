import { Logger, RiskError } from '../../core/index.js';

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 500;

export class KalshiClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly messageHandlers: Array<(data: any) => void> = [];
  private retryCount = 0;
  private connectTimeout: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionallyClosed = false;
  private connecting = false;
  private readonly logger: Logger;

  constructor(wsUrl: string, logger: Logger) {
    this.url = wsUrl;
    this.logger = logger;
  }

  /**
   * Connect to Kalshi WebSocket with exponential backoff reconnect
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connecting) {
        resolve();
        return;
      }

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      this.connecting = true;
      this.intentionallyClosed = false;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.addEventListener('open', () => {
          this.logger.info('Kalshi WS connected');
          this.retryCount = 0;
          this.connecting = false;
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
          }
          resolve();
        });

        this.ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            this.messageHandlers.forEach((handler) => handler(data));
          } catch (e) {
            this.logger.warn('Failed to parse Kalshi message', { error: String(e) });
          }
        });

        this.ws.addEventListener('close', () => {
          this.logger.info('Kalshi WS closed');
          this.connecting = false;
          this.reconnect();
        });

        this.ws.addEventListener('error', (event) => {
          this.logger.error('Kalshi WS error', { error: event });
          this.connecting = false;
          this.reconnect();
        });

        this.connectTimeout = setTimeout(() => {
          this.connecting = false;
          reject(new RiskError('Kalshi WS connection timeout'));
        }, 10000);
      } catch (e) {
        this.connecting = false;
        reject(new RiskError('Failed to create Kalshi WS', { error: String(e) }));
      }
    });
  }

  private reconnect(): void {
    if (this.intentionallyClosed) {
      return;
    }
    if (this.retryCount >= MAX_RETRIES) {
      this.logger.error('Max Kalshi reconnect retries exceeded');
      return;
    }

    const backoff = Math.min(30_000, INITIAL_BACKOFF_MS * Math.pow(2, this.retryCount));
    this.retryCount++;

    this.logger.info('Reconnecting Kalshi WS', { backoff, attempt: this.retryCount });
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((e) =>
        this.logger.error('Reconnection attempt failed', { error: String(e) }),
      );
    }, backoff);
  }

  onMessage(handler: (data: any) => void): void {
    this.messageHandlers.push(handler);
  }

  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.logger.warn('Kalshi WS not open, message not sent');
    }
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
