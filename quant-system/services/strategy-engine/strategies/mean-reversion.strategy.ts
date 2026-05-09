import { FeatureVector, StrategySignal } from '../../../core/index.js';
import { Strategy } from '../strategy.base.js';

export class MeanReversionStrategy extends Strategy {
  constructor() {
    super('MeanReversion');
  }

  evaluate(featureVector: FeatureVector): StrategySignal {
    const { ema21, rsi, probVelocity, volatilityRegime, timestamp } = featureVector;

    const deviation = featureVector.ema3 - ema21;
    const strongDeviation = Math.abs(deviation) > 1.0;

    let direction: 'YES' | 'NO' | 'FLAT' = 'FLAT';
    let confidence = 0.2;
    let reasoning = 'No reversion setup';

    if (strongDeviation && rsi < 32 && probVelocity >= 0) {
      direction = 'YES';
      confidence = 0.58 + (volatilityRegime === 'high' ? 0.07 : 0.03);
      reasoning = 'Oversold with stabilization; reversion long setup';
    } else if (strongDeviation && rsi > 68 && probVelocity <= 0) {
      direction = 'NO';
      confidence = 0.58 + (volatilityRegime === 'high' ? 0.07 : 0.03);
      reasoning = 'Overbought with stall; reversion short setup';
    }

    const expectedValue = direction === 'FLAT' ? 0 : (confidence - 0.5) * (direction === 'YES' ? 0.9 : -0.9);

    return {
      strategyName: this.name,
      direction,
      confidence: this.clampConfidence(confidence),
      expectedValue,
      regime: 'mean-reversion',
      reasoning,
      timestamp,
    };
  }
}
