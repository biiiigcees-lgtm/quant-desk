import { FeatureVector, MarketUpdate } from '../../core/index.js';
import {
  ema,
  rsi,
  macd,
  standardDeviation,
  volatilityRegime,
} from './indicators.js';

export function computeFeatureVector(
  update: MarketUpdate,
  priceHistory: number[],
  emaPeriods: { short: number; long: number },
  probVelocity: number,
  timeDecaySeconds: number,
): FeatureVector {
  const prices = [...priceHistory, update.yesPrice];

  const ema3 = ema(prices, emaPeriods.short);
  const ema9 = ema(prices, 9);
  const ema21 = ema(prices, emaPeriods.long);
  const rsiValue = rsi(prices);
  const macdValue = macd(prices, 12, 26, 9);

  // Order book imbalance
  const obImbalance = calculateOrderBookImbalance(update.bids, update.asks);

  // Volatility
  const recentPrices = prices.slice(-20);
  const volatility = calculateVolatility(recentPrices);
  const regime = volatilityRegime(prices, volatility);

  return {
    contractId: update.contractId,
    impliedProb: update.impliedProb,
    ema3,
    ema9,
    ema21,
    rsi: rsiValue,
    macd: macdValue,
    probVelocity,
    volatilityRegime: regime,
    obImbalance,
    timeDecay: timeDecaySeconds,
    timestamp: update.timestamp,
  };
}

function calculateOrderBookImbalance(
  bids: Array<[number, number]> | undefined,
  asks: Array<[number, number]> | undefined,
): number {
  if (!bids || !asks || bids.length === 0 || asks.length === 0) return 0;

  const bidVolume = bids.reduce((sum, [, size]) => sum + size, 0);
  const askVolume = asks.reduce((sum, [, size]) => sum + size, 0);

  const total = bidVolume + askVolume;
  if (total === 0) return 0;

  return (bidVolume - askVolume) / total;
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(ret);
  }

  return standardDeviation(returns);
}
