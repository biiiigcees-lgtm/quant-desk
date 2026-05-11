import { FeatureEvent } from '../../core/schemas/events.js';

export class BayesianLayer {
  updateProbability(prior: number, feature: FeatureEvent): number {
    const momentumEvidence = 0.5 + Math.max(-0.2, Math.min(0.2, feature.probabilityVelocity * 5));
    const volatilityEvidence = 0.5 - Math.max(-0.15, Math.min(0.15, feature.volatility * 2));
    const flowEvidence = 0.5 + Math.max(-0.2, Math.min(0.2, feature.obi * 0.6));
    const decayEvidence = 0.5 + Math.max(-0.1, Math.min(0.1, (900 - feature.timeToExpirySeconds) / 900));

    const evidence = (momentumEvidence + volatilityEvidence + flowEvidence + decayEvidence) / 4;
    const likelihood = Math.max(0.01, Math.min(0.99, evidence));
    const marginal = likelihood * prior + (1 - likelihood) * (1 - prior);
    if (marginal <= 0) {
      return prior;
    }

    return Math.max(0.01, Math.min(0.99, (likelihood * prior) / marginal));
  }
}
