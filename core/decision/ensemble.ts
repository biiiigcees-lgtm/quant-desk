import { BaseFeatures, SyntheticFeatures } from '../features';
import { Regime } from '../regime/detect';

export interface StrategySignal {
  id: string;
  direction: 'ABOVE' | 'BELOW';
  probability: number;
  confidence: number;
  weight: number;
}

export interface EnsembleOutput {
  direction: 'ABOVE' | 'BELOW';
  probability: number;
  confidence: number;
  signals: StrategySignal[];
}

export function computeEnsemble(
  baseFeatures: BaseFeatures,
  syntheticFeatures: SyntheticFeatures,
  regime: Regime
): EnsembleOutput {
  const signals: StrategySignal[] = [];
  
  // Signal 1: EMA Cross
  const emaSignal: StrategySignal = {
    id: 'ema_cross',
    direction: baseFeatures.emaCross === 'GOLDEN_CROSS' || baseFeatures.emaCross === 'BULL_ALIGNED' ? 'ABOVE' : 'BELOW',
    probability: baseFeatures.emaCross === 'GOLDEN_CROSS' ? 0.65 : baseFeatures.emaCross === 'DEATH_CROSS' ? 0.35 : 0.5,
    confidence: Math.abs(baseFeatures.emaSpread) * 10,
    weight: 0.2,
  };
  signals.push(emaSignal);
  
  // Signal 2: RSI
  const rsiSignal: StrategySignal = {
    id: 'rsi',
    direction: baseFeatures.rsi < 30 ? 'ABOVE' : baseFeatures.rsi > 70 ? 'BELOW' : baseFeatures.rsi > 50 ? 'ABOVE' : 'BELOW',
    probability: baseFeatures.rsi < 30 ? 0.7 : baseFeatures.rsi > 70 ? 0.3 : 0.5,
    confidence: Math.abs(baseFeatures.rsi - 50) / 50,
    weight: 0.15,
  };
  signals.push(rsiSignal);
  
  // Signal 3: MACD
  const macdSignal: StrategySignal = {
    id: 'macd',
    direction: baseFeatures.macdHistogram > 0 ? 'ABOVE' : 'BELOW',
    probability: baseFeatures.macdHistogram > 0 ? 0.6 : 0.4,
    confidence: Math.min(Math.abs(baseFeatures.macdHistogram) / baseFeatures.atr, 1),
    weight: 0.15,
  };
  signals.push(macdSignal);
  
  // Signal 4: Trend Strength
  const trendSignal: StrategySignal = {
    id: 'trend',
    direction: syntheticFeatures.trendStrength > 0 ? 'ABOVE' : 'BELOW',
    probability: syntheticFeatures.trendStrength > 0 ? 0.5 + Math.min(syntheticFeatures.trendStrength / 2, 0.4) : 0.5 - Math.min(Math.abs(syntheticFeatures.trendStrength) / 2, 0.4),
    confidence: Math.min(Math.abs(syntheticFeatures.trendStrength) / 2, 1),
    weight: 0.2,
  };
  signals.push(trendSignal);
  
  // Signal 5: Momentum
  const momentumSignal: StrategySignal = {
    id: 'momentum',
    direction: syntheticFeatures.momentumScore > 0 ? 'ABOVE' : 'BELOW',
    probability: syntheticFeatures.momentumScore > 0 ? 0.5 + Math.min(syntheticFeatures.momentumScore / 10, 0.4) : 0.5 - Math.min(Math.abs(syntheticFeatures.momentumScore) / 10, 0.4),
    confidence: Math.min(Math.abs(syntheticFeatures.momentumScore) / 5, 1),
    weight: 0.15,
  };
  signals.push(momentumSignal);
  
  // Signal 6: Orderbook Imbalance
  const obSignal: StrategySignal = {
    id: 'orderbook',
    direction: baseFeatures.orderbookImbalance > 0 ? 'ABOVE' : 'BELOW',
    probability: 0.5 + baseFeatures.orderbookImbalance * 0.4,
    confidence: Math.abs(baseFeatures.orderbookImbalance),
    weight: 0.15,
  };
  signals.push(obSignal);
  
  // Weighted ensemble
  let aboveWeight = 0;
  let belowWeight = 0;
  let totalConfidence = 0;
  
  for (const signal of signals) {
    if (signal.direction === 'ABOVE') {
      aboveWeight += signal.weight * signal.probability;
    } else {
      belowWeight += signal.weight * signal.probability;
    }
    totalConfidence += signal.weight * signal.confidence;
  }
  
  const totalWeight = aboveWeight + belowWeight;
  const probability = totalWeight > 0 ? aboveWeight / totalWeight : 0.5;
  const confidence = totalConfidence / signals.length;
  const direction = probability > 0.5 ? 'ABOVE' : 'BELOW';
  
  return {
    direction,
    probability,
    confidence,
    signals,
  };
}
