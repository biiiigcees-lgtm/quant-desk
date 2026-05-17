import WebSocket from 'ws';
import { ExchangeConnector, DataNormalizer } from './base';
import { Trade, OrderBook } from '../schemas';

export class CoinbaseConnector implements ExchangeConnector {
  private ws: WebSocket | null = null;
  private readonly tradeCallbacks: Map<string, (trade: Trade) => void> = new Map();
  private readonly orderBookCallbacks: Map<string, (ob: OrderBook) => void> = new Map();
  private readonly subscribedSymbols: Set<string> = new Set();

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');
      
      this.ws.on('open', () => {
        console.log('Coinbase WebSocket connected');
        resolve();
      });

      this.ws.on('error', (error: Error) => {
        console.error('Coinbase WebSocket error:', error);
        reject(error);
      });

      this.ws.on('message', (data: string) => {
        this.handleMessage(JSON.parse(data));
      });

      this.ws.on('close', () => {
        console.log('Coinbase WebSocket disconnected');
        this.subscribedSymbols.clear();
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async subscribeToTrades(symbol: string, callback: (trade: Trade) => void): Promise<void> {
    const coinbaseSymbol = this.toCoinbaseSymbol(symbol);
    this.tradeCallbacks.set(coinbaseSymbol, callback);
    
    if (!this.subscribedSymbols.has(coinbaseSymbol)) {
      this.sendSubscribeMessage(coinbaseSymbol, 'trade');
      this.subscribedSymbols.add(coinbaseSymbol);
    }
  }

  async subscribeToOrderBook(symbol: string, callback: (ob: OrderBook) => void): Promise<void> {
    const coinbaseSymbol = this.toCoinbaseSymbol(symbol);
    this.orderBookCallbacks.set(coinbaseSymbol, callback);
    
    if (!this.subscribedSymbols.has(coinbaseSymbol)) {
      this.sendSubscribeMessage(coinbaseSymbol, 'depth');
      this.subscribedSymbols.add(coinbaseSymbol);
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private toCoinbaseSymbol(symbol: string): string {
    return symbol.replace('/', '-').toUpperCase();
  }

  private sendSubscribeMessage(symbol: string, type: 'trade' | 'depth'): void {
    if (!this.ws) return;

    const channels = type === 'trade' 
      ? [{ name: 'matches', product_ids: [symbol] }]
      : [{ name: 'level2', product_ids: [symbol] }];
    
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      channels,
    }));
  }

  private handleMessage(data: any): void {
    if (data.type === 'match') {
      const trade = DataNormalizer.normalizeTrade(data, 'coinbase');
      const callback = this.tradeCallbacks.get(data.product_id);
      if (callback) callback(trade);
    } else if (data.type === 'l2update') {
      const orderBook = DataNormalizer.normalizeOrderBook(data, 'coinbase');
      const callback = this.orderBookCallbacks.get(data.product_id);
      if (callback) callback(orderBook);
    }
  }
}
