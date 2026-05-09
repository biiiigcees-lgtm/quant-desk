import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { ProbabilityEvent, StrategySignal } from '../../core/schemas/events.js';
import { createDefaultStrategies } from './library.js';
import { Strategy } from './strategy.js';

export class StrategyEcology {
  private readonly strategies: Strategy[] = createDefaultStrategies();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, (event) => {
      queueMicrotask(() => {
        for (const strategy of this.strategies) {
          const signal = strategy.evaluate(event);
          this.bus.emit<StrategySignal>(EVENTS.STRATEGY_SIGNAL, signal);
        }
      });
    });

    this.bus.on<{ strategyId: string; pnl: number }>(EVENTS.RECONCILIATION, (event) => {
      const strategy = this.strategies.find((s) => s.id === event.strategyId);
      if (strategy) strategy.updateStats(event.pnl);
    });
  }

  currentFitness(): Record<string, number> {
    const fit: Record<string, number> = {};
    for (const strategy of this.strategies) {
      const stats = strategy.stats();
      fit[strategy.id] =
        (stats.ev * stats.sharpe * stats.calibrationAccuracy) /
        Math.max(0.001, stats.drawdown + stats.variance);
    }
    return fit;
  }
}
