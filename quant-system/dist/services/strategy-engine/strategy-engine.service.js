import { EVENTS, } from '../../core/index.js';
import { MomentumStrategy } from './strategies/momentum.strategy.js';
import { MeanReversionStrategy } from './strategies/mean-reversion.strategy.js';
import { LiquidityStrategy } from './strategies/liquidity.strategy.js';
import { TimeDecayStrategy } from './strategies/time-decay.strategy.js';
export class StrategyEngineService {
    constructor(eventBus, logger) {
        this.eventBus = eventBus;
        this.logger = logger;
        this.strategies = [
            new MomentumStrategy(),
            new MeanReversionStrategy(),
            new LiquidityStrategy(),
            new TimeDecayStrategy(),
        ];
        this.featureListener = (feature) => this.handleFeatureVector(feature);
    }
    start() {
        this.eventBus.on(EVENTS.FEATURE_VECTOR, this.featureListener);
        this.logger.info('Strategy engine service started', {
            strategies: this.strategies.map((s) => s.getName()),
        });
    }
    stop() {
        this.eventBus.off(EVENTS.FEATURE_VECTOR, this.featureListener);
    }
    handleFeatureVector(featureVector) {
        for (const strategy of this.strategies) {
            try {
                const signal = strategy.evaluate(featureVector);
                this.eventBus.emit(EVENTS.STRATEGY_SIGNAL, {
                    contractId: featureVector.contractId,
                    ...signal,
                });
            }
            catch (error) {
                this.logger.error('Strategy evaluation failed', {
                    strategy: strategy.getName(),
                    error: String(error),
                });
                this.eventBus.emit(EVENTS.STRATEGY_ERROR, {
                    strategy: strategy.getName(),
                    contractId: featureVector.contractId,
                    error: String(error),
                    timestamp: featureVector.timestamp,
                });
            }
        }
    }
}
