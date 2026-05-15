import { computeEMA, computeRSI, computeMACD, computeBollingerBands, computeVWAP, computeATR, computeVolatility } from '../../core/features/base';
import { computeEntropyScore, computeTrendStrength, computeLiquidityStressIndex } from '../../core/features/synthetic';

describe('Feature Engine', () => {
  const candles = Array.from({ length: 50 }, (_, i) => ({
    time: Date.now() - (50 - i) * 900000,
    open: 50000 + i * 10,
    high: 50010 + i * 10,
    low: 49990 + i * 10,
    close: 50000 + i * 10,
    volume: 1000,
  }));

  test('computeEMA returns correct values', () => {
    const closes = candles.map(c => c.close);
    const ema = computeEMA(closes, 9);
    expect(ema).toHaveLength(closes.length - 8);
    expect(ema[ema.length - 1]).toBeGreaterThan(0);
  });

  test('computeRSI returns value between 0 and 100', () => {
    const closes = candles.map(c => c.close);
    const rsi = computeRSI(closes);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  test('computeMACD returns valid structure', () => {
    const closes = candles.map(c => c.close);
    const macd = computeMACD(closes);
    expect(macd).toHaveProperty('macd');
    expect(macd).toHaveProperty('signal');
    expect(macd).toHaveProperty('histogram');
  });

  test('computeBollingerBands returns valid bands', () => {
    const closes = candles.map(c => c.close);
    const bb = computeBollingerBands(closes);
    expect(bb.upper).toBeGreaterThan(bb.middle);
    expect(bb.lower).toBeLessThan(bb.middle);
  });

  test('computeVWAP returns weighted average', () => {
    const vwap = computeVWAP(candles);
    expect(vwap).toBeGreaterThan(0);
  });

  test('computeATR returns positive value', () => {
    const atr = computeATR(candles);
    expect(atr).toBeGreaterThanOrEqual(0);
  });

  test('computeVolatility returns positive value', () => {
    const vol = computeVolatility(candles);
    expect(vol).toBeGreaterThanOrEqual(0);
  });

  test('computeEntropyScore returns value between 0 and 1', () => {
    const entropy = computeEntropyScore(candles);
    expect(entropy).toBeGreaterThanOrEqual(0);
    expect(entropy).toBeLessThanOrEqual(1);
  });

  test('computeTrendStrength returns numeric value', () => {
    const trend = computeTrendStrength(candles);
    expect(typeof trend).toBe('number');
  });

  test('computeLiquidityStressIndex returns value between 0 and 1', () => {
    const ob = { bids: [[50000, 1]], asks: [[50010, 1]] };
    const stress = computeLiquidityStressIndex(ob, candles);
    expect(stress).toBeGreaterThanOrEqual(0);
    expect(stress).toBeLessThanOrEqual(1);
  });
});
