import { FeatureVector, StrategySignal } from '../../../core/index.js';
import { Strategy } from '../strategy.base.js';

export class LiquidityStrategy extends Strategy {
  constructor() {
    super('Liquidity');
  }

  evaluate(featureVector: FeatureVector): StrategySignal {
    const { obImbalance, probVelocity, volatilityRegime, timestamp } = featureVector;

    const imbalanceAbs = Math.abs(obImbalance);
    const strongBookSignal = imbalanceAbs > 0.18;

    let direction: 'YES' | 'NO' | 'FLAT' = 'FLAT';
    let confidence = 0.2;
    let reasoning = 'Order book balanced';

    if (strongBookSignal && obImbalance > 0 && probVelocity >= -0.01) {
      direction = 'YES';
      confidence = 0.56 + Math.min(0.25, imbalanceAbs * 0.8);
      reasoning = 'Bid-side pressure dominates order book';
    } else if (strongBookSignal && obImbalance < 0 && probVelocity <= 0.01) {
      direction = 'NO';
      confidence = 0.56 + Math.min(0.25, imbalanceAbs * 0.8);
      reasoning = 'Ask-side pressure dominates order book';
    }

    if (volatilityRegime === 'high' && direction !== 'FLAT') {
      confidence -= 0.05;
      reasoning += ' (confidence reduced in high volatility)';
    }

    const expectedValue = direction === 'FLAT' ? 0 : (confidence - 0.5) * (direction === 'YES' ? 1.1 : -1.1);

    return {
      strategyName: this.name,
      direction,
      confidence: this.clampConfidence(confidence),
      expectedValue,
      regime: 'order-flow',
      reasoning,
      timestamp,
    };
  }
}
