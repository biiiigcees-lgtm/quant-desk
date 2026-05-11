import {
  EventBus,
  EVENTS,
  FeatureVector,
  Logger,
  StrategySignal,
} from '../../core/index.js';
import { Strategy } from './strategy.base.js';
import { MomentumStrategy } from './strategies/momentum.strategy.js';
import { MeanReversionStrategy } from './strategies/mean-reversion.strategy.js';
import { LiquidityStrategy } from './strategies/liquidity.strategy.js';
import { TimeDecayStrategy } from './strategies/time-decay.strategy.js';

export class StrategyEngineService {
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly strategies: Strategy[];
  private readonly featureListener: (feature: FeatureVector) => void;

  constructor(eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.strategies = [
      new MomentumStrategy(),
      new MeanReversionStrategy(),
      new LiquidityStrategy(),
      new TimeDecayStrategy(),
    ];
    this.featureListener = (feature: FeatureVector) => this.handleFeatureVector(feature);
  }

  start(): void {
    this.eventBus.on(EVENTS.FEATURE_VECTOR, this.featureListener);
    this.logger.info('Strategy engine service started', {
      strategies: this.strategies.map((s) => s.getName()),
    });
  }

  stop(): void {
    this.eventBus.off(EVENTS.FEATURE_VECTOR, this.featureListener);
  }

  private handleFeatureVector(featureVector: FeatureVector): void {
    for (const strategy of this.strategies) {
      try {
        const signal: StrategySignal = strategy.evaluate(featureVector);
        this.eventBus.emit(EVENTS.STRATEGY_SIGNAL, {
          contractId: featureVector.contractId,
          ...signal,
        });
      } catch (error) {
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
