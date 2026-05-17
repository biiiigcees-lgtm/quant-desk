import WebSocket from 'ws';
import { ExchangeConnector, DataNormalizer } from './base';
import { Trade, OrderBook } from '../schemas';

export class BybitConnector implements ExchangeConnector {
  private ws: WebSocket | null = null;
  private readonly tradeCallbacks: Map<string, (trade: Trade) => void> = new Map();
  private readonly orderBookCallbacks: Map<string, (ob: OrderBook) => void> = new Map();
  private readonly subscribedSymbols: Set<string> = new Set();

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');
      
      this.ws.on('open', () => {
        console.log('Bybit WebSocket connected');
        resolve();
      });

      this.ws.on('error', (error: Error) => {
        console.error('Bybit WebSocket error:', error);
        reject(error);
      });

      this.ws.on('message', (data: string) => {
        this.handleMessage(JSON.parse(data));
      });

      this.ws.on('close', () => {
        console.log('Bybit WebSocket disconnected');
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
    const upperSymbol = symbol.toUpperCase();
    this.tradeCallbacks.set(upperSymbol, callback);
    
    if (!this.subscribedSymbols.has(upperSymbol)) {
      this.sendSubscribeMessage(upperSymbol, 'trade');
      this.subscribedSymbols.add(upperSymbol);
    }
  }

  async subscribeToOrderBook(symbol: string, callback: (ob: OrderBook) => void): Promise<void> {
    const upperSymbol = symbol.toUpperCase();
    this.orderBookCallbacks.set(upperSymbol, callback);
    
    if (!this.subscribedSymbols.has(upperSymbol)) {
      this.sendSubscribeMessage(upperSymbol, 'depth');
      this.subscribedSymbols.add(upperSymbol);
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private sendSubscribeMessage(symbol: string, type: 'trade' | 'depth'): void {
    if (!this.ws) return;

    const topic = type === 'trade' ? `publicTrade.${symbol}` : `orderbook.1.${symbol}`;
    
    this.ws.send(JSON.stringify({
      op: 'subscribe',
      args: [topic],
    }));
  }

  private handleMessage(data: any): void {
    if (data.topic && data.topic.startsWith('publicTrade')) {
      const symbol = data.topic.split('.')[1];
      for (const tradeData of data.data) {
        const trade = DataNormalizer.normalizeTrade(tradeData, 'bybit');
        const callback = this.tradeCallbacks.get(symbol);
        if (callback) callback(trade);
      }
    } else if (data.topic && data.topic.startsWith('orderbook')) {
      const symbol = data.topic.split('.')[2];
      const orderBook = DataNormalizer.normalizeOrderBook(data.data, 'bybit');
      const callback = this.orderBookCallbacks.get(symbol);
      if (callback) callback(orderBook);
    }
  }
}
