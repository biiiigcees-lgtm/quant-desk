import { EVENTS } from '../../core/event-bus/events.js';
export class OptimizationEngine {
    constructor(bus, ecology, signal) {
        this.bus = bus;
        this.ecology = ecology;
        this.signal = signal;
    }
    start() {
        this.bus.on(EVENTS.RECONCILIATION, () => {
            const fit = this.ecology.currentFitness();
            this.signal.updateStrategyWeights(fit);
        });
    }
}
