import { Candle, OrderBook } from '../../core/features';
import { redisSet, redisGet } from '../../infra/redis';
import { createLogger } from '../../infra/logger';

const logger = createLogger('MarketAggregator');

export interface MarketSnapshot {
  candles: Candle[];
  orderbook: OrderBook;
  currentPrice: number;
  timestamp: number;
  metadata: { source: string; latency: number; dataHealth: number };
}

export class MarketAggregator {
  private candles: Candle[] = [];
  private orderbook: OrderBook = { bids: [], asks: [] };
  private currentPrice = 0;
  private lastUpdate = 0;

  updatePrice(price: number): void { this.currentPrice = price; this.lastUpdate = Date.now(); }
  updateOrderbook(ob: OrderBook): void { this.orderbook = ob; this.lastUpdate = Date.now(); }
  updateCandles(candles: Candle[]): void { this.candles = candles; this.lastUpdate = Date.now(); }

  async buildSnapshot(): Promise<MarketSnapshot> {
    const snapshot: MarketSnapshot = {
      candles: this.candles, orderbook: this.orderbook, currentPrice: this.currentPrice,
      timestamp: Date.now(), metadata: { source: 'coinbase', latency: Date.now() - this.lastUpdate, dataHealth: this.computeHealth() }
    };
    await redisSet('snapshot:latest', snapshot, 30);
    return snapshot;
  }

  async getSnapshot(): Promise<MarketSnapshot | null> { return redisGet<MarketSnapshot>('snapshot:latest'); }
  private computeHealth(): number { return Math.max(0, 1 - (this.candles.length < 20 ? 0.3 : 0) - (this.currentPrice === 0 ? 0.3 : 0)); }
}

export const createMarketAggregator = () => new MarketAggregator();
