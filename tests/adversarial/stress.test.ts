import { runStressTest, simulateVolatilitySpike, simulateLiquidityCollapse } from '../../core/adversarial/stress';
import { Candle, OrderBook } from '../../core/features';

describe('Adversarial Stress Tests', () => {
  const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
    time: Date.now() - (20 - i) * 900000,
    open: 50000, high: 50010, low: 49990, close: 50000, volume: 1000,
  }));

  const orderbook: OrderBook = {
    bids: [[50000, 10], [49990, 10], [49980, 10]],
    asks: [[50010, 10], [50020, 10], [50030, 10]],
  };

  test('simulateVolatilitySpike increases price range', () => {
    const spiked = simulateVolatilitySpike(candles, 0.5);
    expect(spiked[0].high).toBeGreaterThan(candles[0].high);
    expect(spiked[0].low).toBeLessThan(candles[0].low);
  });

  test('simulateLiquidityCollapse reduces orderbook depth', () => {
    const collapsed = simulateLiquidityCollapse(orderbook, 0.5);
    expect(collapsed.bids[0][1]).toBeLessThan(orderbook.bids[0][1]);
    expect(collapsed.asks[0][1]).toBeLessThan(orderbook.asks[0][1]);
  });

  test('runStressTest returns valid result for volatility spike', () => {
    const result = runStressTest({ type: 'VOLATILITY_SPIKE', severity: 0.5 });
    expect(result).toHaveProperty('robustnessScore');
    expect(result).toHaveProperty('fragilityReport');
    expect(result).toHaveProperty('systemResponse');
    expect(result.robustnessScore).toBeGreaterThanOrEqual(0);
    expect(result.robustnessScore).toBeLessThanOrEqual(1);
  });

  test('runStressTest returns valid result for liquidity collapse', () => {
    const result = runStressTest({ type: 'LIQUIDITY_COLLAPSE', severity: 0.7 });
    expect(result.robustnessScore).toBeLessThan(1);
  });

  test('runStressTest returns valid result for regime flip', () => {
    const result = runStressTest({ type: 'REGIME_FLIP', severity: 0.8 });
    expect(result.robustnessScore).toBe(0.7);
    expect(result.fragilityReport.length).toBeGreaterThan(0);
  });
});
