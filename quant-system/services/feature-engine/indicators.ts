/**
 * Exponential Moving Average
 */
export function ema(prices: number[], period: number): number {
  if (prices.length < period) return prices.length > 0 ? prices[prices.length - 1] : 0;

  let emaValue = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const multiplier = 2 / (period + 1);

  for (let i = period; i < prices.length; i++) {
    emaValue = (prices[i] - emaValue) * multiplier + emaValue;
  }

  return emaValue;
}

/**
 * Relative Strength Index (RSI)
 */
export function rsi(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  const deltas = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push(prices[i] - prices[i - 1]);
  }

  let gains = 0,
    losses = 0;
  for (let i = 0; i < period; i++) {
    if (deltas[i] > 0) gains += deltas[i];
    else losses -= deltas[i];
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < deltas.length; i++) {
    const delta = deltas[i];
    if (delta > 0) {
      avgGain = (avgGain * (period - 1) + delta) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - delta) / period;
    }
  }

  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD (Signal line, Histogram)
 */
export function macd(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): {
  macd: number;
  signal: number;
  histogram: number;
} {
  const emaFast = ema(prices, fastPeriod);
  const emaSlow = ema(prices, slowPeriod);
  const macdLine = emaFast - emaSlow;

  // Signal is EMA of MACD line
  const macdHistory: number[] = [];
  for (let i = Math.max(slowPeriod - 1, 0); i < prices.length; i++) {
    const fast = ema(prices.slice(0, i + 1), fastPeriod);
    const slow = ema(prices.slice(0, i + 1), slowPeriod);
    macdHistory.push(fast - slow);
  }

  const signal = ema(macdHistory, signalPeriod);
  const histogram = macdLine - signal;

  return { macd: macdLine, signal, histogram };
}

/**
 * Standard Deviation (for volatility)
 */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

  return Math.sqrt(avgSquaredDiff);
}

/**
 * Bollinger Bands
 */
export function bollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2,
): {
  middle: number;
  upper: number;
  lower: number;
} {
  if (prices.length < period) {
    const current = prices[prices.length - 1] || 0;
    return { middle: current, upper: current, lower: current };
  }

  const recent = prices.slice(-period);
  const middle = recent.reduce((a, b) => a + b, 0) / period;
  const std = standardDeviation(recent);

  return {
    middle,
    upper: middle + std * stdDevMultiplier,
    lower: middle - std * stdDevMultiplier,
  };
}

/**
 * Volatility regime classification
 */
export function volatilityRegime(prices: number[], volatility: number): 'low' | 'medium' | 'high' {
  if (volatility < 0.02) return 'low';
  if (volatility > 0.05) return 'high';
  return 'medium';
}
