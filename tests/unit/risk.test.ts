import { assessRisk } from '../../core/risk/engine';
import { BaseFeatures, SyntheticFeatures } from '../../core/features';

describe('Risk Engine', () => {
  const baseFeatures: BaseFeatures = {
    ema9: 50000, ema21: 49900, emaSpread: 0.2, emaCross: 'BULL_ALIGNED',
    rsi: 55, macd: 10, macdSignal: 8, macdHistogram: 2,
    bbUpper: 51000, bbMiddle: 50000, bbLower: 49000, bbWidth: 0.04,
    vwap: 50000, atr: 100, volatility: 20, realizedVol: 25,
    orderbookImbalance: 0.1, spread: 10,
  };

  const syntheticFeatures: SyntheticFeatures = {
    entropyScore: 0.5, volatilityMomentumRatio: 1, accelerationProxy: 0,
    liquidityStressIndex: 0.3, trendStrength: 0.5, momentumScore: 0.5, volumeProfileScore: 1,
  };

  test('assessRisk allows trade with good conditions', async () => {
    const result = await assessRisk(baseFeatures, syntheticFeatures, 'TRENDING_UP', 0.8);
    expect(result.allowed).toBe(true);
    expect(result.riskLevel).not.toBe('CRITICAL');
  });

  test('assessRisk blocks trade with low confidence', async () => {
    const result = await assessRisk(baseFeatures, syntheticFeatures, 'TRENDING_UP', 0.5);
    expect(result.allowed).toBe(false);
    expect(result.checks.confidence).toBe(false);
  });

  test('assessRisk blocks trade with high volatility and low liquidity', async () => {
    const highVolFeatures = { ...baseFeatures, realizedVol: 100 };
    const lowLiqFeatures = { ...syntheticFeatures, liquidityStressIndex: 0.9 };
    const result = await assessRisk(highVolFeatures, lowLiqFeatures, 'VOLATILE', 0.8);
    expect(result.allowed).toBe(false);
    expect(result.riskLevel).toBe('CRITICAL');
  });
});
