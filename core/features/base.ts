export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBook {
  bids: [number, number][];
  asks: [number, number][];
}

export interface BaseFeatures {
  ema9: number;
  ema21: number;
  emaSpread: number;
  emaCross: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'BULL_ALIGNED' | 'BEAR_ALIGNED' | 'NONE';
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  vwap: number;
  atr: number;
  volatility: number;
  realizedVol: number;
  orderbookImbalance: number;
  spread: number;
}

export function computeEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Start with SMA for first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);
  
  // Compute EMA for remaining values
  for (let i = period; i < prices.length; i++) {
    const currentEma = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(currentEma);
  }
  
  return ema;
}

export function computeRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function computeMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  
  const ema12 = computeEMA(prices, 12);
  const ema26 = computeEMA(prices, 26);
  
  const macdLine: number[] = [];
  for (let i = 0; i < ema12.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }
  
  const signalLine = computeEMA(macdLine, 9);
  
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

export function computeBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number; width: number } {
  if (prices.length < period) return { upper: 0, middle: 0, lower: 0, width: 0 };
  
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  
  const variance = slice.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  const width = (upper - lower) / middle;
  
  return { upper, middle, lower, width };
}

export function computeVWAP(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  
  let totalVolume = 0;
  let totalVolumePrice = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    totalVolume += candle.volume;
    totalVolumePrice += typicalPrice * candle.volume;
  }
  
  return totalVolumePrice / totalVolume;
}

export function computeATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((a, b) => a + b, 0) / period;
}

export function computeVolatility(candles: Candle[], period: number = 20): number {
  if (candles.length < period) return 0;
  
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  }
  
  const recentReturns = returns.slice(-period);
  const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length;
  
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized %
}

export function computeRealizedVolatility(candles: Candle[]): number {
  if (candles.length < 21) return 0;
  
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    returns.push(Math.log(candles[i].close / candles[i - 1].close));
  }
  
  const recentReturns = returns.slice(-21);
  const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length;
  
  return Math.sqrt(variance * 365 * 24 * 4) * 100; // Annualized % (15-min candles)
}

export function computeOrderbookImbalance(ob: OrderBook, depth: number = 10): number {
  const bids = ob.bids.slice(0, depth);
  const asks = ob.asks.slice(0, depth);
  
  const bidVol = bids.reduce((sum, [, size]) => sum + size, 0);
  const askVol = asks.reduce((sum, [, size]) => sum + size, 0);
  
  if (bidVol + askVol === 0) return 0;
  return (bidVol - askVol) / (bidVol + askVol);
}

export function computeSpread(ob: OrderBook): number {
  if (ob.bids.length === 0 || ob.asks.length === 0) return 0;
  return ob.asks[0][0] - ob.bids[0][0];
}

export function computeBaseFeatures(candles: Candle[], orderbook: OrderBook, currentPrice: number): BaseFeatures {
  const closes = candles.map(c => c.close);
  
  const ema9Arr = computeEMA(closes, 9);
  const ema21Arr = computeEMA(closes, 21);
  const ema9 = ema9Arr[ema9Arr.length - 1] || 0;
  const ema21 = ema21Arr[ema21Arr.length - 1] || 0;
  const emaSpread = currentPrice > 0 ? ((ema9 - ema21) / currentPrice) * 1000 : 0;
  
  const ema9Prev = ema9Arr[ema9Arr.length - 2] || ema9;
  const ema21Prev = ema21Arr[ema21Arr.length - 2] || ema21;
  
  let emaCross: BaseFeatures['emaCross'] = 'NONE';
  if (ema9Prev <= ema21Prev && ema9 > ema21) emaCross = 'GOLDEN_CROSS';
  else if (ema9Prev >= ema21Prev && ema9 < ema21) emaCross = 'DEATH_CROSS';
  else if (ema9 > ema21) emaCross = 'BULL_ALIGNED';
  else if (ema9 < ema21) emaCross = 'BEAR_ALIGNED';
  
  const rsi = computeRSI(closes);
  const { macd, signal, histogram } = computeMACD(closes);
  const { upper: bbUpper, middle: bbMiddle, lower: bbLower, width: bbWidth } = computeBollingerBands(closes);
  const vwap = computeVWAP(candles);
  const atr = computeATR(candles);
  const volatility = computeVolatility(candles);
  const realizedVol = computeRealizedVolatility(candles);
  const orderbookImbalance = computeOrderbookImbalance(orderbook);
  const spread = computeSpread(orderbook);
  
  return {
    ema9,
    ema21,
    emaSpread,
    emaCross,
    rsi,
    macd,
    macdSignal: signal,
    macdHistogram: histogram,
    bbUpper,
    bbMiddle,
    bbLower,
    bbWidth,
    vwap,
    atr,
    volatility,
    realizedVol,
    orderbookImbalance,
    spread,
  };
}
