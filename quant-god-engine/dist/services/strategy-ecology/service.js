import { EVENTS } from '../../core/event-bus/events.js';
import { createDefaultStrategies } from './library.js';
export class StrategyEcology {
    constructor(bus) {
        this.bus = bus;
        this.strategies = createDefaultStrategies();
    }
    start() {
        this.bus.on(EVENTS.PROBABILITY, (event) => {
            for (const strategy of this.strategies) {
                const signal = strategy.evaluate(event);
                this.bus.emit(EVENTS.STRATEGY_SIGNAL, signal);
            }
        });
        this.bus.on(EVENTS.RECONCILIATION, (event) => {
            const strategy = this.strategies.find((s) => s.id === event.strategyId);
            if (strategy)
                strategy.updateStats(event.pnl);
        });
    }
    currentFitness() {
        const fit = {};
        for (const strategy of this.strategies) {
            const stats = strategy.stats();
            fit[strategy.id] =
                (stats.ev * stats.sharpe * stats.calibrationAccuracy) /
                    Math.max(0.001, stats.drawdown + stats.variance);
        }
        return fit;
    }
}
