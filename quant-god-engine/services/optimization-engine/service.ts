import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { StrategyEcology } from '../strategy-ecology/service.js';
import { SignalEngine } from '../signal-engine/service.js';

export class OptimizationEngine {
  constructor(
    private readonly bus: EventBus,
    private readonly ecology: StrategyEcology,
    private readonly signal: SignalEngine,
  ) {}

  start(): void {
    this.bus.on(EVENTS.RECONCILIATION, () => {
      const fit = this.ecology.currentFitness();
      this.signal.updateStrategyWeights(fit);
    });
  }
}
