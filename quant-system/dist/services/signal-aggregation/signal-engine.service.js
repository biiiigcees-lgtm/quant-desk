import { EVENTS, } from '../../core/index.js';
import { aggregateSignals, } from './signal-aggregator.js';
export class SignalEngineService {
    constructor(eventBus, logger, weights, expectedStrategyCount = 4) {
        this.eventBus = eventBus;
        this.logger = logger;
        this.expectedStrategyCount = expectedStrategyCount;
        this.weights = weights;
        this.pending = new Map();
        this.strategyListener = (signal) => this.handleStrategySignal(signal);
    }
    start() {
        this.eventBus.on(EVENTS.STRATEGY_SIGNAL, this.strategyListener);
        this.logger.info('Signal aggregation service started', {
            expectedStrategyCount: this.expectedStrategyCount,
            weights: this.weights,
        });
    }
    stop() {
        this.eventBus.off(EVENTS.STRATEGY_SIGNAL, this.strategyListener);
        this.pending.clear();
    }
    handleStrategySignal(signal) {
        const { contractId, strategyName } = signal;
        if (!this.pending.has(contractId)) {
            this.pending.set(contractId, new Map());
        }
        const contractSignals = this.pending.get(contractId);
        contractSignals.set(strategyName, signal);
        if (contractSignals.size < this.expectedStrategyCount) {
            return;
        }
        const aggregated = aggregateSignals(contractId, Array.from(contractSignals.values()), this.weights, signal.timestamp);
        this.eventBus.emit(EVENTS.AGGREGATED_SIGNAL, aggregated);
        this.logger.debug('Aggregated signal emitted', {
            contractId,
            finalSignal: aggregated.finalSignal,
            score: aggregated.score,
            agreement: aggregated.agreement,
        });
        contractSignals.clear();
    }
}
