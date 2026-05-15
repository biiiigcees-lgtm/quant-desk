import { Candle, OrderBook, BaseFeatures } from './base';

export interface SyntheticFeatures {
  entropyScore: number;
  volatilityMomentumRatio: number;
  accelerationProxy: number;
  liquidityStressIndex: number;
  trendStrength: number;
  momentumScore: number;
  volumeProfileScore: number;
}

export function computeEntropyScore(candles: Candle[]): number {
  if (candles.length < 20) return 0;
  
  const recent = candles.slice(-20);
  const returns = [];
  
  for (let i = 1; i < recent.length; i++) {
    returns.push((recent[i].close - recent[i - 1].close) / recent[i - 1].close);
  }
  
  // Bin returns into 10 buckets
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const bucketSize = (max - min) / 10;
  const buckets = new Array(10).fill(0);
  
  for (const r of returns) {
    const bucketIndex = Math.min(Math.floor((r - min) / bucketSize), 9);
    buckets[bucketIndex]++;
  }
  
  // Compute Shannon entropy
  let entropy = 0;
  const total = returns.length;
  
  for (const count of buckets) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }
  
  // Normalize to 0-1
  return entropy / Math.log2(10);
}

export function computeVolatilityMomentumRatio(candles: Candle[]): number {
  if (candles.length < 30) return 0;
  
  const recent20 = candles.slice(-20);
  const prev10 = candles.slice(-30, -20);
  
  const volRecent = computeVolatility(recent20);
  const volPrev = computeVolatility(prev10);
  
  if (volPrev === 0) return 0;
  return volRecent / volPrev;
}

function computeVolatility(candles: Candle[]): number {
  const returns = [];
  for (let i = 1; i < candles.length; i++) {
    returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

export function computeAccelerationProxy(candles: Candle[]): number {
  if (candles.length < 10) return 0;
  
  const recent = candles.slice(-10);
  const prices = recent.map(c => c.close);
  
  // Second derivative approximation
  const firstDerivatives = [];
  for (let i = 1; i < prices.length; i++) {
    firstDerivatives.push(prices[i] - prices[i - 1]);
  }
  
  const secondDerivatives = [];
  for (let i = 1; i < firstDerivatives.length; i++) {
    secondDerivatives.push(firstDerivatives[i] - firstDerivatives[i - 1]);
  }
  
  if (secondDerivatives.length === 0) return 0;
  return secondDerivatives[secondDerivatives.length - 1];
}

export function computeLiquidityStressIndex(orderbook: OrderBook, candles: Candle[]): number {
  // Combine orderbook depth and spread stress
  const bids = orderbook.bids.slice(0, 20);
  const asks = orderbook.asks.slice(0, 20);
  
  const bidVol = bids.reduce((sum, [, size]) => sum + size, 0);
  const askVol = asks.reduce((sum, [, size]) => sum + size, 0);
  const totalVol = bidVol + askVol;
  
  const spread = orderbook.asks[0]?.[0] - orderbook.bids[0]?.[0] || 0;
  const midPrice = (orderbook.asks[0]?.[0] + orderbook.bids[0]?.[0]) / 2 || candles[candles.length - 1]?.close || 0;
  
  const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;
  
  // Volume stress (inverse of volume)
  const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
  const volumeStress = avgVolume > 0 ? 1 / Math.log(avgVolume + 1) : 1;
  
  // Spread stress
  const spreadStress = Math.min(spreadPct / 0.1, 1); // Normalize, cap at 0.1% spread
  
  // Depth stress (inverse of depth)
  const depthStress = totalVol > 0 ? 1 / Math.log(totalVol + 1) : 1;
  
  // Combined stress index
  return (volumeStress * 0.4 + spreadStress * 0.3 + depthStress * 0.3);
}

export function computeTrendStrength(candles: Candle[]): number {
  if (candles.length < 20) return 0;
  
  const recent = candles.slice(-20);
  const prices = recent.map(c => c.close);
  
  // Linear regression slope
  const n = prices.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += prices[i];
    sumXY += i * prices[i];
    sumX2 += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgPrice = sumY / n;
  
  // Normalize slope by price
  return avgPrice > 0 ? (slope / avgPrice) * 100 : 0;
}

export function computeMomentumScore(candles: Candle[]): number {
  if (candles.length < 10) return 0;
  
  const recent = candles.slice(-10);
  const prices = recent.map(c => c.close);
  
  // Rate of change over different periods
  const roc1 = (prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2];
  const roc3 = (prices[prices.length - 1] - prices[prices.length - 4]) / prices[prices.length - 4];
  const roc5 = (prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6];
  
  // Weighted momentum score
  return (roc1 * 0.5 + roc3 * 0.3 + roc5 * 0.2) * 100;
}

export function computeVolumeProfileScore(candles: Candle[]): number {
  if (candles.length < 20) return 0;
  
  const recent = candles.slice(-20);
  const volumes = recent.map(c => c.volume);
  
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const currentVolume = volumes[volumes.length - 1];
  
  // Compare current volume to average
  return avgVolume > 0 ? (currentVolume / avgVolume) : 1;
}

export function computeSyntheticFeatures(candles: Candle[], orderbook: OrderBook): SyntheticFeatures {
  return {
    entropyScore: computeEntropyScore(candles),
    volatilityMomentumRatio: computeVolatilityMomentumRatio(candles),
    accelerationProxy: computeAccelerationProxy(candles),
    liquidityStressIndex: computeLiquidityStressIndex(orderbook, candles),
    trendStrength: computeTrendStrength(candles),
    momentumScore: computeMomentumScore(candles),
    volumeProfileScore: computeVolumeProfileScore(candles),
  };
}
