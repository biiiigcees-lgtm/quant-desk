// Unit Tests for Indicator Computations
// Tests EMA, RSI, MACD, Bollinger Bands, ATR, VWAP, Stochastic calculations

describe('Indicator Computations', () => {
  
  describe('computeEMA', () => {
    test('should compute EMA correctly for valid data', () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
      const ema = computeEMA(prices, 5);
      expect(ema).toBeDefined();
      expect(ema.length).toBe(prices.length);
      expect(ema[ema.length - 1]).toBeGreaterThan(0);
    });

    test('should handle insufficient data', () => {
      const prices = [100, 101];
      const ema = computeEMA(prices, 5);
      expect(ema).toBeDefined();
      expect(ema.every(v => v === null || v === 0)).toBe(true);
    });

    test('should handle empty array', () => {
      const ema = computeEMA([], 5);
      expect(ema).toBeDefined();
      expect(ema.length).toBe(0);
    });
  });

  describe('computeRSI', () => {
    test('should compute RSI correctly for valid data', () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
      const rsi = computeRSI(prices, 14);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    test('should return 50 for insufficient data', () => {
      const prices = [100, 101];
      const rsi = computeRSI(prices, 14);
      expect(rsi).toBe(50);
    });

    test('should handle extreme overbought conditions', () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
      const rsi = computeRSI(prices, 14);
      expect(rsi).toBeGreaterThan(50);
    });
  });

  describe('computeMACD', () => {
    test('should compute MACD correctly', () => {
      const prices = Array.from({length: 30}, (_, i) => 100 + i);
      const macd = computeMACD(prices);
      expect(macd).toBeDefined();
      expect(macd.macd).toBeDefined();
      expect(macd.signal).toBeDefined();
    });

    test('should handle insufficient data', () => {
      const prices = [100, 101];
      const macd = computeMACD(prices);
      expect(macd.macd).toBe(0);
      expect(macd.signal).toBe(0);
    });
  });

  describe('computeBB', () => {
    test('should compute Bollinger Bands correctly', () => {
      const prices = Array.from({length: 25}, (_, i) => 100 + Math.random() * 10);
      const bb = computeBB(prices, 20);
      expect(bb.upper).toBeGreaterThan(bb.mid);
      expect(bb.mid).toBeGreaterThan(bb.lower);
    });

    test('should handle insufficient data', () => {
      const prices = [100, 101];
      const bb = computeBB(prices, 20);
      expect(bb.upper).toBe(0);
      expect(bb.mid).toBe(0);
      expect(bb.lower).toBe(0);
    });
  });

  describe('computeATR', () => {
    test('should compute ATR correctly', () => {
      const candles = Array.from({length: 20}, (_, i) => ({
        high: 100 + i + Math.random() * 5,
        low: 95 + i + Math.random() * 5,
        close: 98 + i + Math.random() * 5,
        open: 97 + i + Math.random() * 5
      }));
      const atr = computeATR(candles, 14);
      expect(atr).toBeGreaterThan(0);
    });

    test('should handle insufficient candles', () => {
      const candles = [{high: 100, low: 95, close: 98, open: 97}];
      const atr = computeATR(candles, 14);
      expect(atr).toBe(0);
    });
  });

  describe('computeVWAP', () => {
    test('should compute VWAP correctly', () => {
      const candles = Array.from({length: 10}, (_, i) => ({
        high: 100 + i,
        low: 95 + i,
        close: 98 + i,
        volume: 10 + i
      }));
      const vwap = computeVWAP(candles);
      expect(vwap).toBeGreaterThan(0);
    });

    test('should handle empty candles', () => {
      const vwap = computeVWAP([]);
      expect(vwap).toBe(0);
    });
  });

  describe('computeStoch', () => {
    test('should compute Stochastic correctly', () => {
      const candles = Array.from({length: 20}, (_, i) => ({
        high: 100 + i + Math.random() * 10,
        low: 95 + i + Math.random() * 10,
        close: 98 + i + Math.random() * 10
      }));
      const stoch = computeStoch(candles, 14);
      expect(stoch).toBeGreaterThanOrEqual(0);
      expect(stoch).toBeLessThanOrEqual(100);
    });

    test('should handle flat price (equal high/low)', () => {
      const candles = Array.from({length: 20}, () => ({
        high: 100,
        low: 100,
        close: 100
      }));
      const stoch = computeStoch(candles, 14);
      expect(stoch).toBe(50);
    });
  });

  describe('trajectorySlope', () => {
    test('should compute positive slope for uptrend', () => {
      const values = [100, 101, 102, 103, 104, 105];
      const slope = trajectorySlope(values, 6);
      expect(slope).toBeGreaterThan(0);
    });

    test('should compute negative slope for downtrend', () => {
      const values = [105, 104, 103, 102, 101, 100];
      const slope = trajectorySlope(values, 6);
      expect(slope).toBeLessThan(0);
    });

    test('should handle insufficient data', () => {
      const values = [100];
      const slope = trajectorySlope(values, 6);
      expect(slope).toBe(0);
    });
  });

  describe('detectFVGs', () => {
    test('should detect bullish FVG', () => {
      const candles = [
        {high: 100, low: 95, close: 98},
        {high: 102, low: 97, close: 101},
        {high: 105, low: 100, close: 103}
      ];
      const fvgs = detectFVGs(candles);
      expect(fvgs).toBeDefined();
      expect(Array.isArray(fvgs)).toBe(true);
    });

    test('should detect bearish FVG', () => {
      const candles = [
        {high: 105, low: 100, close: 103},
        {high: 102, low: 97, close: 99},
        {high: 100, low: 95, close: 97}
      ];
      const fvgs = detectFVGs(candles);
      expect(fvgs).toBeDefined();
      expect(Array.isArray(fvgs)).toBe(true);
    });
  });

  describe('detectSweeps', () => {
    test('should detect buy-side liquidity sweep', () => {
      const candles = [
        {high: 100, low: 95, close: 98},
        {high: 105, low: 94, close: 96}
      ];
      const sweeps = detectSweeps(candles);
      expect(sweeps).toBeDefined();
      expect(Array.isArray(sweeps)).toBe(true);
    });

    test('should detect sell-side liquidity sweep', () => {
      const candles = [
        {high: 105, low: 95, close: 102},
        {high: 104, low: 90, close: 103}
      ];
      const sweeps = detectSweeps(candles);
      expect(sweeps).toBeDefined();
      expect(Array.isArray(sweeps)).toBe(true);
    });
  });

  describe('computeADX', () => {
    test('should compute ADX correctly', () => {
      const candles = Array.from({length: 30}, (_, i) => ({
        high: 100 + i + Math.random() * 5,
        low: 95 + i + Math.random() * 5,
        close: 98 + i + Math.random() * 5
      }));
      const adx = computeADX(candles, 14);
      expect(adx).toBeGreaterThanOrEqual(0);
      expect(adx).toBeLessThanOrEqual(100);
    });

    test('should handle insufficient data', () => {
      const candles = [{high: 100, low: 95, close: 98}];
      const adx = computeADX(candles, 14);
      expect(adx).toBe(0);
    });
  });

  describe('kalmanUpdate', () => {
    test('should initialize on first call', () => {
      const result = kalmanUpdate(100);
      expect(result.price).toBe(100);
      expect(result.velocity).toBe(0);
      expect(result.uncertainty).toBeGreaterThan(0);
    });

    test('should track price movement', () => {
      kalmanUpdate(100);
      const result = kalmanUpdate(101);
      expect(result.price).toBeGreaterThan(100);
      expect(result.velocity).toBeGreaterThan(0);
    });

    test('should handle price decrease', () => {
      kalmanUpdate(100);
      const result = kalmanUpdate(99);
      expect(result.price).toBeLessThan(100);
      expect(result.velocity).toBeLessThan(0);
    });
  });
});
