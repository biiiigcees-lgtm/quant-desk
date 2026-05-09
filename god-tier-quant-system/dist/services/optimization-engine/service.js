import { EVENTS } from '../../core/event-bus/events.js';
export class OptimizationEngine {
    constructor(bus, ecology, signal) {
        this.bus = bus;
        this.ecology = ecology;
        this.signal = signal;
        this.blockedStrategies = new Set();
    }
    start() {
        this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
            if (event.status === 'fail') {
                this.blockedStrategies.add(event.strategyId);
            }
            else if (event.status === 'pass') {
                this.blockedStrategies.delete(event.strategyId);
            }
            this.refreshWeights();
        });
        this.bus.on(EVENTS.RECONCILIATION, () => {
            this.refreshWeights();
        });
    }
    refreshWeights() {
        const fit = this.ecology.currentFitness();
        const adjusted = {};
        for (const [strategyId, weight] of Object.entries(fit)) {
            adjusted[strategyId] = this.blockedStrategies.has(strategyId) ? 0 : weight;
        }
        this.signal.updateStrategyWeights(adjusted);
    }
}
