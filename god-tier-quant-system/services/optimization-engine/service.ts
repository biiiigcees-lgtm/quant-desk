import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { StrategyEcology } from '../strategy-ecology/service.js';
import { SignalEngine } from '../signal-engine/service.js';
import { SelfImprovementEvent, ValidationResultEvent } from '../../core/schemas/events.js';

export class OptimizationEngine {
  private readonly blockedStrategies = new Set<string>();
  private aiSuggestedWeights: Record<string, number> = {};
  private lastAppliedWeights: Record<string, number> = {};
  private adaptationLocked = false;
  private latestContractId = 'global';

  constructor(
    private readonly bus: EventBus,
    private readonly ecology: StrategyEcology,
    private readonly signal: SignalEngine,
  ) {}

  start(): void {
    this.bus.on<ValidationResultEvent>(EVENTS.VALIDATION_RESULT, (event) => {
      if (event.status === 'fail') {
        this.blockedStrategies.add(event.strategyId);
      } else if (event.status === 'pass') {
        this.blockedStrategies.delete(event.strategyId);
      }
      this.refreshWeights();
    });

    this.bus.on(EVENTS.RECONCILIATION, () => {
      this.refreshWeights();
    });

    this.bus.on(EVENTS.EXECUTION_CONTROL, (event: { mode?: string; contractId?: string }) => {
      this.latestContractId = event.contractId ?? this.latestContractId;
      this.adaptationLocked = event.mode === 'hard-stop';
      if (this.adaptationLocked) {
        this.publishSelfImprovement('guarded-hard-stop', true, this.lastAppliedWeights);
      }
    });

    this.bus.on(EVENTS.META_CALIBRATION, (event: { contractId: string; authorityDecay: number }) => {
      this.latestContractId = event.contractId;
      if (event.authorityDecay > 0.75) {
        this.adaptationLocked = true;
        this.publishSelfImprovement('guarded-meta-calibration-decay', true, this.lastAppliedWeights);
      } else if (event.authorityDecay < 0.45) {
        this.adaptationLocked = false;
      }
    });

    this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event: { strategy_weights?: Record<string, number> }) => {
      this.aiSuggestedWeights = event.strategy_weights ?? {};
      this.refreshWeights();
    });
  }

  private refreshWeights(): void {
    const fit = this.ecology.currentFitness();
    if (this.adaptationLocked) {
      this.signal.updateStrategyWeights(this.lastAppliedWeights);
      return;
    }

    const adjusted: Record<string, number> = {};
    for (const [strategyId, weight] of Object.entries(fit)) {
      const aiWeight = this.aiSuggestedWeights[strategyId];
      const blendedWeight =
        typeof aiWeight === 'number' && aiWeight >= 0
          ? weight * 0.8 + aiWeight * 0.2
          : weight;
      const previous = this.lastAppliedWeights[strategyId] ?? blendedWeight;
      const boundedDelta = clamp(blendedWeight - previous, -0.25, 0.25);
      adjusted[strategyId] = this.blockedStrategies.has(strategyId)
        ? 0
        : clamp(previous + boundedDelta, 0, 1);
    }

    const normalized = normalizeWeights(adjusted);
    this.lastAppliedWeights = normalized;
    this.publishSelfImprovement('fitness-validation-update', false, normalized);
    this.signal.updateStrategyWeights(normalized);
  }

  private publishSelfImprovement(
    reason: string,
    guarded: boolean,
    updatedWeights: Record<string, number>,
  ): void {
    const adaptationRate = clamp(
      Object.values(updatedWeights).reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, Object.keys(updatedWeights).length),
      0,
      1,
    );

    const event: SelfImprovementEvent = {
      strategyId: 'portfolio-optimizer',
      contractId: this.latestContractId,
      adaptationRate: Number(adaptationRate.toFixed(4)),
      guarded,
      reason,
      updatedWeights,
      timestamp: Date.now(),
    };

    this.bus.emit<SelfImprovementEvent>(EVENTS.SELF_IMPROVEMENT, event);
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'strategy.self-improvement.rate',
      value: event.adaptationRate,
      tags: { guarded: String(guarded), reason },
      timestamp: event.timestamp,
    });
  }
}

function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const positive = Object.fromEntries(Object.entries(weights).filter(([, value]) => value > 0));
  const total = Object.values(positive).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(positive).map(([key, value]) => [key, Number((value / total).toFixed(6))]),
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
