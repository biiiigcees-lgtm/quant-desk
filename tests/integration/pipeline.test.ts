import { analyze } from '../../core/engine/analyze';
import { Candle, OrderBook } from '../../core/features';

describe('Pipeline Integration', () => {
  const candles: Candle[] = Array.from({ length: 50 }, (_, i) => ({
    time: Date.now() - (50 - i) * 900000,
    open: 50000 + i * 10,
    high: 50010 + i * 10,
    low: 49990 + i * 10,
    close: 50000 + i * 10,
    volume: 1000,
  }));

  const orderbook: OrderBook = {
    bids: [[50000, 1], [49990, 1], [49980, 1]],
    asks: [[50010, 1], [50020, 1], [50030, 1]],
  };

  test('analyze returns valid output', async () => {
    const snapshot = {
      candles,
      orderbook,
      currentPrice: 50000,
      timestamp: Date.now(),
    };

    const result = await analyze(snapshot);

    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('probability');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('expectedValue');
    expect(result).toHaveProperty('regime');
    expect(result).toHaveProperty('riskStatus');
    expect(result).toHaveProperty('explanation');
  });

  test('analyze probability is between 0 and 1', async () => {
    const snapshot = { candles, orderbook, currentPrice: 50000, timestamp: Date.now() };
    const result = await analyze(snapshot);
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
  });

  test('analyze confidence is between 0 and 1', async () => {
    const snapshot = { candles, orderbook, currentPrice: 50000, timestamp: Date.now() };
    const result = await analyze(snapshot);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
