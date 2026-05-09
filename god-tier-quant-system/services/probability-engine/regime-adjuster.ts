import { FeatureEvent, MicrostructureEvent, Regime } from '../../core/schemas/events.js';

export class RegimeAdjuster {
  inferRegime(feature: FeatureEvent, micro: MicrostructureEvent): Regime {
    if (micro.panicRepricing) return 'panic';
    if (micro.liquidityRegime === 'vacuum') return 'low-liquidity';
    if (feature.volatility < 0.01 && micro.spreadExpansionScore < 0.2) return 'compression';
    if (feature.volatility > 0.04) return 'expansion';
    if (Math.abs(feature.probabilityVelocity) > 0.03 && Math.abs(micro.obiVelocity) > 0.2) {
      return 'momentum-ignition';
    }
    if (Math.abs(feature.probabilityVelocity) < 0.01) return 'choppy';
    return feature.probabilityVelocity > 0 ? 'trending' : 'reversal-prone';
  }

  adjustProbability(base: number, regime: Regime): number {
    const multiplier: Record<Regime, number> = {
      trending: 1.05,
      choppy: 0.95,
      panic: 0.85,
      'low-liquidity': 0.9,
      'reversal-prone': 0.98,
      'momentum-ignition': 1.08,
      compression: 1,
      expansion: 0.92,
    };

    const centered = base - 0.5;
    return Math.max(0.01, Math.min(0.99, 0.5 + centered * multiplier[regime]));
  }
}
