import { MarketContext } from '../schemas';

export interface NoiseMetrics {
  noiseScore: number;
  isClean: boolean;
  suspiciousActivity: string[];
  confidence: number;
}

export function noiseFilter(
  ctx: MarketContext,
  tradeCount: number,
  whaleCount: number,
  orderBookSweeps: number
): NoiseMetrics {
  let score = 0;
  const suspiciousActivities: string[] = [];

  // High volatility increases noise risk
  if (ctx.volatility > 0.7) {
    score += 0.25;
    suspiciousActivities.push('HIGH_VOLATILITY');
  }

  // Whale activity detection
  if (whaleCount > 5) {
    score += 0.3;
    suspiciousActivities.push('EXCESSIVE_WHALE_ACTIVITY');
  } else if (whaleCount > 3) {
    score += 0.15;
    suspiciousActivities.push('WHALE_ACTIVITY');
  }

  // Order book sweeps (potential spoofing)
  if (orderBookSweeps > 3) {
    score += 0.35;
    suspiciousActivities.push('ORDERBOOK_SWEEPING');
  } else if (orderBookSweeps > 1) {
    score += 0.15;
    suspiciousActivities.push('ORDERBOOK_SWEEPING');
  }

  // High trade frequency (potential wash trading)
  if (tradeCount > 100) {
    score += 0.2;
    suspiciousActivities.push('HIGH_TRADE_FREQUENCY');
  }

  // Liquidation-driven price action
  const liquidationImbalance = Math.abs(ctx.liquidationLong - ctx.liquidationShort);
  if (liquidationImbalance > 1000000) {
    score += 0.15;
    suspiciousActivities.push('LARGE_LIQUIDATION_IMBALANCE');
  }

  // Order book imbalance extreme (potential manipulation)
  if (ctx.orderBookImbalance !== undefined) {
    if (Math.abs(ctx.orderBookImbalance) > 0.8) {
      score += 0.2;
      suspiciousActivities.push('EXTREME_ORDERBOOK_IMBALANCE');
    }
  }

  const noiseScore = Math.min(1, score);
  const isClean = noiseScore < 0.5;
  const confidence = 1 - noiseScore;

  return {
    noiseScore,
    isClean,
    suspiciousActivity: suspiciousActivities,
    confidence,
  };
}

export function detectSpoofing(
  orderBookHistory: { bids: number[]; asks: number[] }[]
): boolean {
  if (orderBookHistory.length < 5) return false;

  // Check for rapid order placement and cancellation
  const recentChanges = orderBookHistory.slice(-5);
  let bidVolatility = 0;
  let askVolatility = 0;

  for (let i = 1; i < recentChanges.length; i++) {
    const bidChange = Math.abs(recentChanges[i].bids[0] - recentChanges[i - 1].bids[0]);
    const askChange = Math.abs(recentChanges[i].asks[0] - recentChanges[i - 1].asks[0]);
    bidVolatility += bidChange;
    askVolatility += askChange;
  }

  // High volatility in top levels may indicate spoofing
  return bidVolatility > 100 || askVolatility > 100;
}

export function detectWashTrading(
  trades: { price: number; volume: number; timestamp: number }[]
): boolean {
  if (trades.length < 10) return false;

  // Check for circular trading patterns
  const priceGroups = new Map<number, number>();
  
  for (const trade of trades) {
    const roundedPrice = Math.round(trade.price * 100);
    priceGroups.set(roundedPrice, (priceGroups.get(roundedPrice) || 0) + trade.volume);
  }

  // If most volume is at few price points, suspicious
  const volumes = Array.from(priceGroups.values());
  volumes.sort((a, b) => b - a);
  
  const topTwoVolume = volumes.slice(0, 2).reduce((a, b) => a + b, 0);
  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  
  return (topTwoVolume / totalVolume) > 0.8;
}

export function applyNoiseDiscount(
  originalValue: number,
  noiseScore: number,
  maxDiscount: number = 0.5
): number {
  const discount = Math.min(maxDiscount, noiseScore * maxDiscount);
  return originalValue * (1 - discount);
}
