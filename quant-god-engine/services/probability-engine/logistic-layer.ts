import { FeatureEvent } from '../../core/schemas/events.js';

export interface LogisticResult {
  probability: number;
  uncertainty: number;
  confidenceInterval: [number, number];
}

export class LogisticLayer {
  private readonly beta = {
    b0: -0.03,
    probabilityVelocity: 1.5,
    obi: 1.2,
    volatility: -0.9,
    spreadExpansionScore: -0.7,
    sweepProbability: -0.4,
    pressureAcceleration: 0.8,
    timeToExpirySeconds: -0.0004,
  };

  infer(feature: FeatureEvent): LogisticResult {
    const z =
      this.beta.b0 +
      this.beta.probabilityVelocity * feature.probabilityVelocity +
      this.beta.obi * feature.obi +
      this.beta.volatility * feature.volatility +
      this.beta.spreadExpansionScore * feature.spreadExpansionScore +
      this.beta.sweepProbability * feature.sweepProbability +
      this.beta.pressureAcceleration * feature.pressureAcceleration +
      this.beta.timeToExpirySeconds * feature.timeToExpirySeconds;

    const probability = 1 / (1 + Math.exp(-z));
    const uncertainty = Math.max(0.01, Math.min(1, 1 - Math.abs(probability - 0.5) * 2));
    const width = 0.12 + uncertainty * 0.2;

    return {
      probability,
      uncertainty,
      confidenceInterval: [
        Math.max(0, probability - width / 2),
        Math.min(1, probability + width / 2),
      ],
    };
  }
}
