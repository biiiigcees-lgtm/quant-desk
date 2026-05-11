import { EVENTS } from '../../core/event-bus/events.js';
export class OptimizationEngine {
    constructor(bus, ecology, signal) {
        this.bus = bus;
        this.ecology = ecology;
        this.signal = signal;
        this.blockedStrategies = new Set();
        this.aiSuggestedWeights = {};
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
        this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
            this.aiSuggestedWeights = event.strategy_weights ?? {};
            this.refreshWeights();
        });
    }
    refreshWeights() {
        const fit = this.ecology.currentFitness();
        const adjusted = {};
        for (const [strategyId, weight] of Object.entries(fit)) {
            const aiWeight = this.aiSuggestedWeights[strategyId];
            const blendedWeight = typeof aiWeight === 'number' && aiWeight >= 0
                ? weight * 0.8 + aiWeight * 0.2
                : weight;
            adjusted[strategyId] = this.blockedStrategies.has(strategyId) ? 0 : blendedWeight;
        }
        this.signal.updateStrategyWeights(adjusted);
    }
}
