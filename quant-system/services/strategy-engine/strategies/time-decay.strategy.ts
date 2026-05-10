import { FeatureVector, StrategySignal } from '../../../core/index.js';
import { Strategy } from '../strategy.base.js';

export class TimeDecayStrategy extends Strategy {
  constructor() {
    super('TimeDecay');
  }

  evaluate(featureVector: FeatureVector): StrategySignal {
    const { impliedProb, probVelocity, timeDecay, timestamp } = {
      impliedProb: featureVector.impliedProb,
      probVelocity: featureVector.probVelocity,
      timeDecay: featureVector.timeDecay,
      timestamp: featureVector.timestamp,
    };

    const minutesLeft = timeDecay / 60;
    let direction: 'YES' | 'NO' | 'FLAT' = 'FLAT';
    let confidence = 0.2;
    let reasoning = 'Too early for expiry pressure';

    if (minutesLeft <= 8) {
      if (impliedProb > 0.56 && probVelocity >= -0.005) {
        direction = 'YES';
        confidence = 0.55 + Math.max(0, (8 - minutesLeft) * 0.03);
        reasoning = 'Late-cycle decay favors YES persistence';
      } else if (impliedProb < 0.44 && probVelocity <= 0.005) {
        direction = 'NO';
        confidence = 0.55 + Math.max(0, (8 - minutesLeft) * 0.03);
        reasoning = 'Late-cycle decay favors NO persistence';
      } else {
        reasoning = 'Expiry window active but direction uncertain';
      }
    }

    let expectedValue = 0;
    if (direction !== 'FLAT') {
      expectedValue = (confidence - 0.5) * (direction === 'YES' ? 0.8 : -0.8);
    }

    return {
      strategyName: this.name,
      direction,
      confidence: this.clampConfidence(confidence),
      expectedValue,
      regime: 'time-decay',
      reasoning,
      timestamp,
    };
  }
}
