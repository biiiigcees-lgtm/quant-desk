import WebSocket from 'ws';
import { ExchangeConnector, DataNormalizer } from './base';
import { Trade, OrderBook } from '../schemas';

export class BinanceConnector implements ExchangeConnector {
  private ws: WebSocket | null = null;
  private readonly tradeCallbacks: Map<string, (trade: Trade) => void> = new Map();
  private readonly orderBookCallbacks: Map<string, (ob: OrderBook) => void> = new Map();
  private readonly subscribedSymbols: Set<string> = new Set();

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://stream.binance.com:9443/ws');
      
      this.ws.on('open', () => {
        console.log('Binance WebSocket connected');
        resolve();
      });

      this.ws.on('error', (error: Error) => {
        console.error('Binance WebSocket error:', error);
        reject(error);
      });

      this.ws.on('message', (data: string) => {
        this.handleMessage(JSON.parse(data));
      });

      this.ws.on('close', () => {
        console.log('Binance WebSocket disconnected');
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
    const lowerSymbol = symbol.toLowerCase();
    this.tradeCallbacks.set(lowerSymbol, callback);
    
    if (!this.subscribedSymbols.has(lowerSymbol)) {
      this.sendSubscribeMessage(lowerSymbol, 'trade');
      this.subscribedSymbols.add(lowerSymbol);
    }
  }

  async subscribeToOrderBook(symbol: string, callback: (ob: OrderBook) => void): Promise<void> {
    const lowerSymbol = symbol.toLowerCase();
    this.orderBookCallbacks.set(lowerSymbol, callback);
    
    if (!this.subscribedSymbols.has(lowerSymbol)) {
      this.sendSubscribeMessage(lowerSymbol, 'depth');
      this.subscribedSymbols.add(lowerSymbol);
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private sendSubscribeMessage(symbol: string, type: 'trade' | 'depth'): void {
    if (!this.ws) return;

    const method = type === 'trade' ? 'aggTrade' : 'depth';
    const stream = `${symbol}@${method}`;
    
    this.ws.send(JSON.stringify({
      method: 'SUBSCRIBE',
      params: [stream],
      id: Date.now(),
    }));
  }

  private handleMessage(data: any): void {
    if (data.e === 'aggTrade') {
      const trade = DataNormalizer.normalizeTrade(data, 'binance');
      const callback = this.tradeCallbacks.get(data.s.toLowerCase());
      if (callback) callback(trade);
    } else if (data.e === 'depthUpdate') {
      const orderBook = DataNormalizer.normalizeOrderBook(data, 'binance');
      const callback = this.orderBookCallbacks.get(data.s.toLowerCase());
      if (callback) callback(orderBook);
    }
  }
}
