import { Trade, OrderBook } from '../schemas';

export interface MicrostructureFeatures {
  aggressionImbalance: number;
  absorptionRatio: number;
  tradeFlowIntensity: number;
  orderBookSkew: number;
  largeTradeCount: number;
}

export function reconstructMicrostructure(
  trades: Trade[],
  orderBook: OrderBook
): MicrostructureFeatures {
  if (!trades.length) {
    return {
      aggressionImbalance: 0,
      absorptionRatio: 1,
      tradeFlowIntensity: 0,
      orderBookSkew: 0,
      largeTradeCount: 0,
    };
  }

  const buyAgg = trades
    .filter(t => t.side === 'buy')
    .reduce((sum, t) => sum + t.volume, 0);
  const sellAgg = trades
    .filter(t => t.side === 'sell')
    .reduce((sum, t) => sum + t.volume, 0);
  const totalAgg = buyAgg + sellAgg || 1;
  
  // Aggression imbalance: net buyer vs seller aggression [-1, 1]
  const aggressionImbalance = (buyAgg - sellAgg) / totalAgg;

  // Absorption ratio: how much the book depth can absorb imbalance
  const bidsDepth = orderBook.bids.reduce((sum: number, b: [number, number]) => sum + b[1], 0);
  const asksDepth = orderBook.asks.reduce((sum: number, a: [number, number]) => sum + a[1], 0);
  const absorptionRatio = (bidsDepth + 1) / (asksDepth + 1);

  // Trade flow intensity: normalized total volume
  const avgVolume = trades.reduce((sum, t) => sum + t.volume, 0) / trades.length;
  const tradeFlowIntensity = Math.min(1, avgVolume / 1000);

  // Order book skew: bid-ask depth imbalance
  const orderBookSkew = (bidsDepth - asksDepth) / (bidsDepth + asksDepth + 1);

  // Large trade count: trades > 2x average volume
  const largeTradeCount = trades.filter(t => t.volume > avgVolume * 2).length;

  return {
    aggressionImbalance,
    absorptionRatio,
    tradeFlowIntensity,
    orderBookSkew,
    largeTradeCount,
  };
}

export function classifyTradeFlow(features: MicrostructureFeatures): string {
  if (features.aggressionImbalance > 0.3 && features.tradeFlowIntensity > 0.5) {
    return 'STRONG_BUYING_PRESSURE';
  }
  if (features.aggressionImbalance < -0.3 && features.tradeFlowIntensity > 0.5) {
    return 'STRONG_SELLING_PRESSURE';
  }
  if (features.largeTradeCount > 3) {
    return 'WHALE_ACTIVITY';
  }
  if (Math.abs(features.aggressionImbalance) < 0.1) {
    return 'BALANCED_FLOW';
  }
  return 'MODERATE_IMBALANCE';
}
