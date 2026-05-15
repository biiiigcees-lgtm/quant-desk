import { Candle, BaseFeatures, SyntheticFeatures } from '../features';

export type Regime = 
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'CHOPPY'
  | 'RANGE'
  | 'VOLATILE'
  | 'PANIC';

export interface RegimeDetection {
  regime: Regime;
  confidence: number;
  features: {
    trendDirection: number;
    volatilityLevel: number;
    momentum: number;
    liquidity: number;
  };
}

export function detectRegime(
  candles: Candle[],
  baseFeatures: BaseFeatures,
  syntheticFeatures: SyntheticFeatures
): RegimeDetection {
  const trendStrength = syntheticFeatures.trendStrength;
  const volatility = baseFeatures.realizedVol;
  const momentum = syntheticFeatures.momentumScore;
  const liquidityStress = syntheticFeatures.liquidityStressIndex;
  const rsi = baseFeatures.rsi;
  const emaSpread = baseFeatures.emaSpread;
  
  let regime: Regime;
  let confidence = 0;
  
  // Panic detection (extreme conditions)
  if (volatility > 100 || liquidityStress > 0.8 || rsi < 20 || rsi > 80) {
    regime = 'PANIC';
    confidence = Math.min(
      (volatility / 100) * 0.4 +
      (liquidityStress / 0.8) * 0.3 +
      (rsi < 20 ? (20 - rsi) / 20 : (rsi - 80) / 20) * 0.3,
      1
    ) * 100;
  }
  // Volatile regime
  else if (volatility > 60) {
    regime = 'VOLATILE';
    confidence = Math.min(volatility / 100, 1) * 100;
  }
  // Trending up
  else if (trendStrength > 0.5 && emaSpread > 0.1 && momentum > 1) {
    regime = 'TRENDING_UP';
    confidence = Math.min(
      (trendStrength / 2) * 0.4 +
      (emaSpread / 1) * 0.3 +
      (momentum / 5) * 0.3,
      1
    ) * 100;
  }
  // Trending down
  else if (trendStrength < -0.5 && emaSpread < -0.1 && momentum < -1) {
    regime = 'TRENDING_DOWN';
    confidence = Math.min(
      (Math.abs(trendStrength) / 2) * 0.4 +
      (Math.abs(emaSpread) / 1) * 0.3 +
      (Math.abs(momentum) / 5) * 0.3,
      1
    ) * 100;
  }
  // Choppy (high entropy, low trend)
  else if (syntheticFeatures.entropyScore > 0.7 && Math.abs(trendStrength) < 0.2) {
    regime = 'CHOPPY';
    confidence = Math.min(
      (syntheticFeatures.entropyScore / 0.7) * 0.6 +
      (1 - Math.abs(trendStrength) / 0.2) * 0.4,
      1
    ) * 100;
  }
  // Range (low volatility, low trend)
  else {
    regime = 'RANGE';
    confidence = Math.min(
      (1 - volatility / 60) * 0.5 +
      (1 - Math.abs(trendStrength) / 0.5) * 0.5,
      1
    ) * 100;
  }
  
  return {
    regime,
    confidence,
    features: {
      trendDirection: trendStrength,
      volatilityLevel: volatility,
      momentum,
      liquidity: liquidityStress,
    },
  };
}
