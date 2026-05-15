import WebSocket from 'ws';
import { redisSet, redisGet } from '../../infra/redis';
import { createLogger } from '../../infra/logger';

const logger = createLogger('CoinbaseWS');

export interface TickerMessage {
  type: 'ticker';
  product_id: string;
  price: string;
  best_bid: string;
  best_ask: string;
  high_24h: string;
  low_24h: string;
  open_24h: string;
  volume_24h: string;
  time: string;
}

export interface Level2Message {
  type: 'snapshot' | 'l2update';
  product_id: string;
  bids?: [string, string][];
  asks?: [string, string][];
  changes?: ['buy' | 'sell', string, string][];
}

export interface TradeMessage {
  type: 'match';
  product_id: string;
  price: string;
  size: string;
  side: 'buy' | 'sell';
  time: string;
}

export class CoinbaseWS {
  private ws: WebSocket | null = null;
  private url: string;
  private productId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private subscriptions: Set<string> = new Set();
  private messageHandlers: Map<string, (msg: any) => void> = new Map();

  constructor(url: string = 'wss://ws-feed.exchange.coinbase.com', productId: string = 'BTC-USD') {
    this.url = url;
    this.productId = productId;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      logger.info('WebSocket connected');
      this.reconnectAttempts = 0;
      this.subscribe();
      this.startHeartbeat();
    });

    this.ws.on('message', (data: string) => {
      try {
        const msg = JSON.parse(data);
        this.handleMessage(msg);
      } catch (error) {
        logger.error('Failed to parse message', error);
      }
    });

    this.ws.on('error', (error) => {
      logger.error('WebSocket error', error);
    });

    this.ws.on('close', () => {
      logger.warn('WebSocket closed, reconnecting...');
      this.scheduleReconnect();
    });
  }

  private subscribe(): void {
    if (!this.ws) return;

    const subscribeMsg = {
      type: 'subscribe',
      product_ids: [this.productId],
      channels: ['ticker', 'level2_50', 'matches'],
    };

    this.ws.send(JSON.stringify(subscribeMsg));
    logger.info(`Subscribed to ${this.productId}`);
  }

  private startHeartbeat(): void {
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat', on: true, product_ids: [this.productId] }));
      }
    }, 20000);
  }

  private handleMessage(msg: any): void {
    const handler = this.messageHandlers.get(msg.type);
    if (handler) {
      handler(msg);
    }

    // Store in Redis
    redisSet(`ws:${msg.type}:${Date.now()}`, msg, 60);
  }

  on(event: string, handler: (msg: any) => void): void {
    this.messageHandlers.set(event, handler);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    setTimeout(() => {
      logger.info(`Reconnecting (attempt ${this.reconnectAttempts})`);
      this.connect();
    }, delay);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export function createCoinbaseWS(url?: string, productId?: string): CoinbaseWS {
  return new CoinbaseWS(url, productId);
}
