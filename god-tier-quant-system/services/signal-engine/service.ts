import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { AggregatedSignal, ProbabilityEvent, StrategySignal } from '../../core/schemas/events.js';

export class SignalEngine {
  private readonly buffer: Map<string, StrategySignal[]> = new Map();
  private readonly latestProbability: Map<string, ProbabilityEvent> = new Map();
  private strategyWeights: Record<string, number> = {};

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, (event) => {
      this.latestProbability.set(event.contractId, event);
    });

    this.bus.on<StrategySignal>(EVENTS.STRATEGY_SIGNAL, (event) => {
      const bucket = this.buffer.get(event.contractId) ?? [];
      bucket.push(event);
      this.buffer.set(event.contractId, bucket);
      if (bucket.length >= 6) {
        this.aggregate(event.contractId, bucket);
        this.buffer.set(event.contractId, []);
      }
    });
  }

  private aggregate(contractId: string, signals: StrategySignal[]): void {
    const probability = this.latestProbability.get(contractId);
    if (!probability) return;

    let weightedScore = 0;
    let totalWeight = 0;
    let yesWeight = 0;
    let noWeight = 0;

    for (const signal of signals) {
      const fitness = this.strategyWeights[signal.strategyId] ?? 1;
      const weight = Math.max(0.05, fitness * signal.confidence);
      totalWeight += weight;
      if (signal.direction === 'YES') {
        weightedScore += weight;
        yesWeight += weight;
      } else if (signal.direction === 'NO') {
        weightedScore -= weight;
        noWeight += weight;
      }
    }

    const normalized = totalWeight > 0 ? weightedScore / totalWeight : 0;
    let direction: AggregatedSignal['direction'] = 'FLAT';
    if (normalized > 0.15) {
      direction = 'YES';
    } else if (normalized < -0.15) {
      direction = 'NO';
    }
    const agreement = totalWeight > 0 ? (Math.max(yesWeight, noWeight) / totalWeight) * 100 : 0;

    const output: AggregatedSignal = {
      contractId,
      direction,
      score: normalized * 100,
      agreement,
      strategyWeights: this.strategyWeights,
      strategySignals: signals,
      regime: probability.regime,
      timestamp: Date.now(),
    };

    this.bus.emit(EVENTS.AGGREGATED_SIGNAL, output);
  }

  updateStrategyWeights(weights: Record<string, number>): void {
    this.strategyWeights = weights;
  }
}
