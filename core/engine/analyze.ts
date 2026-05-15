import { Candle, OrderBook } from '../features';
import { Regime, detectRegime } from '../regime/detect';
import { computeEnsemble } from '../decision/ensemble';
import { computeEV, EVInput } from '../decision/ev';
import { assessRisk } from '../risk/engine';
import { simulateShadow } from '../shadow/simulator';
import { executeGenome, StrategyGenome } from '../invention/genome';
import { applyCalibration } from '../calibration/calibrator';

export interface MarketSnapshot {
  candles: Candle[];
  orderbook: OrderBook;
  currentPrice: number;
  timestamp: number;
}

export interface AnalysisOutput {
  action: 'TRADE' | 'NO_TRADE';
  direction: 'ABOVE' | 'BELOW';
  probability: number;
  confidence: number;
  expectedValue: number;
  regime: Regime;
  riskStatus: string;
  shadowComparison: any;
  explanation: string;
}

export async function analyze(snapshot: MarketSnapshot, strategyGenome?: StrategyGenome, calibrationState?: any): Promise<AnalysisOutput> {
  const { candles, orderbook, currentPrice } = snapshot;
  const baseFeatures = computeBaseFeatures(candles, orderbook, currentPrice);
  const syntheticFeatures = computeSyntheticFeatures(candles, orderbook);
  const regimeDetection = detectRegime(candles, baseFeatures, syntheticFeatures);
  const regime = regimeDetection.regime;
  
  let direction: 'ABOVE' | 'BELOW', probability: number, confidence: number;
  if (strategyGenome) {
    const inputs = [baseFeatures.emaSpread, baseFeatures.rsi / 100, baseFeatures.orderbookImbalance];
    const genomeOutput = executeGenome(strategyGenome, inputs);
    direction = genomeOutput > 0.5 ? 'ABOVE' : 'BELOW';
    probability = genomeOutput;
    confidence = Math.abs(genomeOutput - 0.5) * 2;
  } else {
    const ensemble = computeEnsemble(baseFeatures, syntheticFeatures, regime);
    direction = ensemble.direction;
    probability = ensemble.probability;
    confidence = ensemble.confidence;
  }
  
  if (calibrationState) probability = applyCalibration(probability, calibrationState.bias);
  
  const payout = 100, loss = 100;
  const evOutput = computeEV({ probability, payout, loss });
  const riskAssessment = await assessRisk(baseFeatures, syntheticFeatures, regime, confidence);
  const shadowResult = simulateShadow(direction, probability, payout, loss, Math.random() > 0.5);
  const action = evOutput.decision === 'TRADE' && riskAssessment.allowed ? 'TRADE' : 'NO_TRADE';
  
  return {
    action, direction, probability, confidence, expectedValue: evOutput.expectedValue,
    regime, riskStatus: riskAssessment.riskLevel, shadowComparison: shadowResult,
    explanation: `Regime: ${regime}. EV: ${evOutput.expectedValue.toFixed(2)}. Risk: ${riskAssessment.riskLevel}. ${riskAssessment.reason}`
  };
}

function computeBaseFeatures(candles: Candle[], orderbook: OrderBook, currentPrice: number): any {
  const closes = candles.map(c => c.close);
  const ema9 = computeEMA(closes, 9), ema21 = computeEMA(closes, 21);
  const emaSpread = currentPrice > 0 ? ((ema9[ema9.length - 1] - ema21[ema21.length - 1]) / currentPrice) * 1000 : 0;
  let emaCross = 'NONE';
  if (ema9[ema9.length - 2] <= ema21[ema21.length - 2] && ema9[ema9.length - 1] > ema21[ema21.length - 1]) emaCross = 'GOLDEN_CROSS';
  else if (ema9[ema9.length - 2] >= ema21[ema21.length - 2] && ema9[ema9.length - 1] < ema21[ema21.length - 1]) emaCross = 'DEATH_CROSS';
  else if (ema9[ema9.length - 1] > ema21[ema21.length - 1]) emaCross = 'BULL_ALIGNED';
  else emaCross = 'BEAR_ALIGNED';
  
  const rsi = computeRSI(closes), macd = computeMACD(closes), bb = computeBollingerBands(candles);
  const bidVol = orderbook.bids.slice(0, 10).reduce((a, b) => a + b[1], 0);
  const askVol = orderbook.asks.slice(0, 10).reduce((a, b) => a + b[1], 0);
  const orderbookImbalance = (bidVol - askVol) / (bidVol + askVol + 1e-9);
  const spread = orderbook.asks[0]?.[0] - orderbook.bids[0]?.[0] || 0;
  
  return {
    ema9: ema9[ema9.length - 1] || 0, ema21: ema21[ema21.length - 1] || 0, emaSpread, emaCross,
    rsi, macd: macd.macd, macdSignal: macd.signal, macdHistogram: macd.histogram,
    bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower, bbWidth: bb.width,
    vwap: computeVWAP(candles), atr: computeATR(candles), volatility: computeVolatility(candles),
    realizedVol: computeRealizedVolatility(candles), orderbookImbalance, spread
  };
}

function computeSyntheticFeatures(candles: Candle[], orderbook: OrderBook): any {
  return {
    entropyScore: computeEntropy(candles),
    trendStrength: computeTrendStrength(candles),
    liquidityStressIndex: computeLiquidityStress(orderbook, candles),
    momentumScore: 0, accelerationProxy: 0, volumeProfileScore: 0
  };
}

function computeEMA(prices: number[], period: number): number[] {
  const ema: number[] = [], mult = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  ema.push(sum / period);
  for (let i = period; i < prices.length; i++) ema.push((prices[i] - ema[ema.length - 1]) * mult + ema[ema.length - 1]);
  return ema;
}

function computeRSI(prices: number[]): number {
  if (prices.length < 15) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14; i++) {
    const ch = prices[i] - prices[i - 1];
    if (ch > 0) gains += ch; else losses -= ch;
  }
  return losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
}

function computeMACD(prices: number[]): any {
  const ema12 = computeEMA(prices, 12), ema26 = computeEMA(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = computeEMA(macdLine, 9);
  return { macd: macdLine[macdLine.length - 1], signal: signal[signal.length - 1], histogram: macdLine[macdLine.length - 1] - signal[signal.length - 1] };
}

function computeBollingerBands(candles: Candle[]): any {
  const closes = candles.map(c => c.close).slice(-20);
  const mid = closes.reduce((a, b) => a + b, 0) / closes.length;
  const std = Math.sqrt(closes.reduce((s, p) => s + Math.pow(p - mid, 2), 0) / closes.length);
  return { upper: mid + 2 * std, middle: mid, lower: mid - 2 * std, width: (4 * std) / mid };
}

function computeVWAP(candles: Candle[]): number {
  let totalVol = 0, totalVolPrice = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    totalVol += c.volume;
    totalVolPrice += tp * c.volume;
  }
  return totalVolPrice / totalVol;
}

function computeATR(candles: Candle[]): number {
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return trs.slice(-14).reduce((a, b) => a + b, 0) / 14;
}

function computeVolatility(candles: Candle[]): number {
  const rets = [];
  for (let i = 1; i < candles.length; i++) rets.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rets.length;
  return Math.sqrt(varr) * Math.sqrt(252) * 100;
}

function computeRealizedVolatility(candles: Candle[]): number {
  const rets = [];
  for (let i = 1; i < candles.length; i++) rets.push(Math.log(candles[i].close / candles[i - 1].close));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rets.length;
  return Math.sqrt(varr * 365 * 24 * 4) * 100;
}

function computeEntropy(candles: Candle[]): number {
  const rets = [];
  for (let i = 1; i < candles.length; i++) rets.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  const min = Math.min(...rets), max = Math.max(...rets);
  const buckets = new Array(10).fill(0);
  for (const r of rets) buckets[Math.min(Math.floor((r - min) / ((max - min) / 10)), 9)]++;
  let ent = 0;
  for (const b of buckets) if (b > 0) ent -= (b / rets.length) * Math.log2(b / rets.length);
  return ent / Math.log2(10);
}

function computeTrendStrength(candles: Candle[]): number {
  const prices = candles.map(c => c.close).slice(-20);
  const n = prices.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += prices[i]; sxy += i * prices[i]; sx2 += i * i; }
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  return (slope / (sy / n)) * 100;
}

function computeLiquidityStress(ob: OrderBook, candles: Candle[]): number {
  const bidVol = ob.bids.slice(0, 20).reduce((a, b) => a + b[1], 0);
  const askVol = ob.asks.slice(0, 20).reduce((a, b) => a + b[1], 0);
  const spread = ob.asks[0]?.[0] - ob.bids[0]?.[0] || 0;
  const mid = (ob.asks[0]?.[0] + ob.bids[0]?.[0]) / 2 || candles[candles.length - 1]?.close || 0;
  const spreadStress = Math.min((spread / mid) * 100 / 0.1, 1);
  const depthStress = 1 / Math.log(bidVol + askVol + 1);
  return (spreadStress * 0.5 + depthStress * 0.5);
}
