import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { StrategyEcology } from '../strategy-ecology/service.js';
import { SignalEngine } from '../signal-engine/service.js';
import { ValidationResultEvent } from '../../core/schemas/events.js';

export class OptimizationEngine {
  private readonly blockedStrategies = new Set<string>();

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
  }

  private refreshWeights(): void {
    const fit = this.ecology.currentFitness();
    const adjusted: Record<string, number> = {};
    for (const [strategyId, weight] of Object.entries(fit)) {
      adjusted[strategyId] = this.blockedStrategies.has(strategyId) ? 0 : weight;
    }
    this.signal.updateStrategyWeights(adjusted);
  }
}
