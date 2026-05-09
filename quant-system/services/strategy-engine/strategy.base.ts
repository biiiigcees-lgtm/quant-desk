import { FeatureVector, StrategySignal } from '../../core/index.js';

export abstract class Strategy {
  protected readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  abstract evaluate(featureVector: FeatureVector): StrategySignal;

  protected clampConfidence(value: number): number {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }
}
