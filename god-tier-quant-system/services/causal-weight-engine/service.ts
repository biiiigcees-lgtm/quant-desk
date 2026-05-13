import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
import type { RealityAlignmentEvent, CausalWeightsEvent } from '../../core/schemas/events.js';

const CONFIDENCE_WINDOW = 30;
const MIN_WEIGHT = 0.05;

interface WeightState {
  weights: { liquidity: number; flow: number; volatility: number; entropy: number };
  errorHistory: {
    liquidity: number[];
    flow: number[];
    volatility: number[];
    entropy: number[];
  };
  sampleSize: number;
  lastCalibrationAt: number;
}

function rollingAccuracy(errors: number[]): number {
  if (errors.length === 0) return 0.5;
  const avgError = errors.reduce((s, e) => s + e, 0) / errors.length;
  return Math.max(0, 1 - avgError);
}

function softmax(vals: number[]): number[] {
  const max = Math.max(...vals);
  const exp = vals.map(v => Math.exp(v - max));
  const sum = exp.reduce((s, v) => s + v, 0);
  return exp.map(v => v / sum);
}

export class CausalWeightEngine {
  private readonly state = new Map<string, WeightState>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<RealityAlignmentEvent>(EVENTS.REALITY_ALIGNMENT, safeHandler((e) => {
      this.processAlignment(e);
    }, 'CausalWeightEngine'));
  }

  private processAlignment(e: RealityAlignmentEvent): void {
    const state = this.getOrInit(e.contractId);

    // Record error per causal dimension
    state.errorHistory.liquidity.push(e.errorDecomposition.liquidityError);
    state.errorHistory.flow.push(e.errorDecomposition.flowError);
    state.errorHistory.volatility.push(e.errorDecomposition.volatilityError);
    state.errorHistory.entropy.push(e.errorDecomposition.entropyError);

    if (state.errorHistory.liquidity.length > CONFIDENCE_WINDOW) state.errorHistory.liquidity.shift();
    if (state.errorHistory.flow.length > CONFIDENCE_WINDOW) state.errorHistory.flow.shift();
    if (state.errorHistory.volatility.length > CONFIDENCE_WINDOW) state.errorHistory.volatility.shift();
    if (state.errorHistory.entropy.length > CONFIDENCE_WINDOW) state.errorHistory.entropy.shift();

    // Compute per-force accuracy
    const accuracies = [
      rollingAccuracy(state.errorHistory.liquidity),
      rollingAccuracy(state.errorHistory.flow),
      rollingAccuracy(state.errorHistory.volatility),
      rollingAccuracy(state.errorHistory.entropy),
    ];

    // Use updated weights from reality alignment as primary source,
    // but also blend with our own accuracy-derived weights
    const softWeights = softmax(accuracies);
    const alignWeights = e.updatedWeights;

    // Blend: 60% from reality alignment learning, 40% from accuracy softmax
    const blendedWeights = {
      liquidity: Math.max(MIN_WEIGHT, alignWeights.liquidity * 0.6 + (softWeights[0] ?? 0.25) * 0.4),
      flow:      Math.max(MIN_WEIGHT, alignWeights.flow * 0.6      + (softWeights[1] ?? 0.35) * 0.4),
      volatility: Math.max(MIN_WEIGHT, alignWeights.volatility * 0.6 + (softWeights[2] ?? 0.25) * 0.4),
      entropy:   Math.max(MIN_WEIGHT, alignWeights.entropy * 0.6   + (softWeights[3] ?? 0.15) * 0.4),
    };

    // Normalize
    const total = Object.values(blendedWeights).reduce((s, v) => s + v, 0);
    if (total > 0.001) {
      blendedWeights.liquidity /= total;
      blendedWeights.flow /= total;
      blendedWeights.volatility /= total;
      blendedWeights.entropy /= total;
    }

    const confidences = {
      liquidity:  rollingAccuracy(state.errorHistory.liquidity),
      flow:       rollingAccuracy(state.errorHistory.flow),
      volatility: rollingAccuracy(state.errorHistory.volatility),
      entropy:    rollingAccuracy(state.errorHistory.entropy),
    };

    state.weights = blendedWeights;
    state.sampleSize = e.sampleSize;
    state.lastCalibrationAt = e.timestamp;

    const event: CausalWeightsEvent = {
      contractId: e.contractId,
      weights: { ...blendedWeights },
      confidences,
      sampleSize: e.sampleSize,
      lastCalibrationAt: e.timestamp,
      timestamp: e.timestamp,
    };
    this.bus.emit<CausalWeightsEvent>(EVENTS.CAUSAL_WEIGHTS, event);
  }

  getWeights(contractId: string): { liquidity: number; flow: number; volatility: number; entropy: number } {
    return this.state.get(contractId)?.weights ?? { liquidity: 0.25, flow: 0.35, volatility: 0.25, entropy: 0.15 };
  }

  private getOrInit(contractId: string): WeightState {
    let s = this.state.get(contractId);
    if (!s) {
      s = {
        weights: { liquidity: 0.25, flow: 0.35, volatility: 0.25, entropy: 0.15 },
        errorHistory: { liquidity: [], flow: [], volatility: [], entropy: [] },
        sampleSize: 0,
        lastCalibrationAt: Date.now(),
      };
      this.state.set(contractId, s);
    }
    return s;
  }
}
