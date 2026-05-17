import { Trade, OrderBook, MarketContext } from '../schemas';

export interface ExchangeConnector {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribeToTrades(symbol: string, callback: (trade: Trade) => void): Promise<void>;
  subscribeToOrderBook(symbol: string, callback: (ob: OrderBook) => void): Promise<void>;
  isConnected(): boolean;
}

export interface DataSourceConnector {
  fetchLiquidations(symbol: string, startTime: number, endTime: number): Promise<any[]>;
  fetchFundingRates(symbol: string): Promise<any[]>;
  fetchOpenInterest(symbol: string): Promise<any[]>;
  fetchSentiment(symbol: string): Promise<any[]>;
}

export class DataNormalizer {
  static normalizeTrade(raw: any, _exchange: string): Trade {
    return {
      symbol: raw.s || raw.symbol,
      timestamp: raw.T || raw.timestamp || Date.now(),
      price: Number(raw.p || raw.price),
      volume: Number(raw.q || raw.volume),
      side: raw.m ? 'sell' : 'buy', // Binance: true = sell
      tradeId: raw.t || raw.id || String(raw.tradeId),
    };
  }

  static normalizeOrderBook(raw: any, _exchange: string): OrderBook {
    const bids = raw.bids || raw.b || [];
    const asks = raw.asks || raw.a || [];
    
    const bidsDepth = bids.reduce((sum: number, bid: any) => sum + Number(bid[1]), 0);
    const asksDepth = asks.reduce((sum: number, ask: any) => sum + Number(ask[1]), 0);

    return {
      symbol: raw.s || raw.symbol,
      timestamp: raw.T || raw.timestamp || Date.now(),
      bids: bids.map((b: any) => [Number(b[0]), Number(b[1])]),
      asks: asks.map((a: any) => [Number(a[0]), Number(a[1])]),
      bidsDepth,
      asksDepth,
    };
  }

  static toMarketContext(
    trades: Trade[],
    orderBook: OrderBook,
    liquidations: { long: number; short: number },
    fundingRate?: number,
    openInterest?: number,
    volatility?: number
  ): MarketContext {
    const buyVolume = trades
      .filter(t => t.side === 'buy')
      .reduce((sum, t) => sum + t.volume, 0);
    const sellVolume = trades
      .filter(t => t.side === 'sell')
      .reduce((sum, t) => sum + t.volume, 0);
    const totalVolume = trades.reduce((sum, t) => sum + t.volume, 0);
    const latestPrice = trades.length > 0 ? trades[trades.length - 1].price : orderBook.bids[0]?.[0] || 0;

    const bidsDepth = orderBook.bids.reduce((sum: number, b: [number, number]) => sum + b[1], 0);
    const asksDepth = orderBook.asks.reduce((sum: number, a: [number, number]) => sum + a[1], 0);
    const orderBookImbalance = (bidsDepth - asksDepth) / (bidsDepth + asksDepth + 1);

    return {
      symbol: orderBook.symbol,
      timestamp: Date.now(),
      price: latestPrice,
      volume: totalVolume,
      buyVolume,
      sellVolume,
      orderBookImbalance,
      fundingRate,
      openInterest,
      liquidationLong: liquidations.long,
      liquidationShort: liquidations.short,
      volatility: volatility ?? 0,
    };
  }
}
