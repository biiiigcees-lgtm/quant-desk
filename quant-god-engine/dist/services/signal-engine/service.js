import { EVENTS } from '../../core/event-bus/events.js';
export class SignalEngine {
    constructor(bus) {
        this.bus = bus;
        this.buffer = new Map();
        this.latestProbability = new Map();
        this.strategyWeights = {};
    }
    start() {
        this.bus.on(EVENTS.PROBABILITY, (event) => {
            this.latestProbability.set(event.contractId, event);
        });
        this.bus.on(EVENTS.STRATEGY_SIGNAL, (event) => {
            const bucket = this.buffer.get(event.contractId) ?? [];
            bucket.push(event);
            this.buffer.set(event.contractId, bucket);
            if (bucket.length >= 6) {
                this.aggregate(event.contractId, bucket);
                this.buffer.set(event.contractId, []);
            }
        });
    }
    aggregate(contractId, signals) {
        const probability = this.latestProbability.get(contractId);
        if (!probability)
            return;
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
            }
            else if (signal.direction === 'NO') {
                weightedScore -= weight;
                noWeight += weight;
            }
        }
        const normalized = totalWeight > 0 ? weightedScore / totalWeight : 0;
        let direction = 'FLAT';
        if (normalized > 0.15) {
            direction = 'YES';
        }
        else if (normalized < -0.15) {
            direction = 'NO';
        }
        const agreement = totalWeight > 0 ? (Math.max(yesWeight, noWeight) / totalWeight) * 100 : 0;
        const output = {
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
    updateStrategyWeights(weights) {
        this.strategyWeights = weights;
    }
}
