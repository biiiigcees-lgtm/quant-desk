import {
  EventBus,
  EVENTS,
  Logger,
} from '../../core/index.js';
import {
  aggregateSignals,
  AggregationWeights,
  WeightedStrategySignal,
} from './signal-aggregator.js';

export class SignalEngineService {
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly expectedStrategyCount: number;
  private readonly weights: AggregationWeights;
  private readonly pending: Map<string, Map<string, WeightedStrategySignal>>;
  private readonly strategyListener: (signal: WeightedStrategySignal) => void;

  constructor(
    eventBus: EventBus,
    logger: Logger,
    weights: AggregationWeights,
    expectedStrategyCount: number = 4,
  ) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.expectedStrategyCount = expectedStrategyCount;
    this.weights = weights;
    this.pending = new Map();
    this.strategyListener = (signal) => this.handleStrategySignal(signal);
  }

  start(): void {
    this.eventBus.on(EVENTS.STRATEGY_SIGNAL, this.strategyListener);
    this.logger.info('Signal aggregation service started', {
      expectedStrategyCount: this.expectedStrategyCount,
      weights: this.weights,
    });
  }

  stop(): void {
    this.eventBus.off(EVENTS.STRATEGY_SIGNAL, this.strategyListener);
    this.pending.clear();
  }

  private handleStrategySignal(signal: WeightedStrategySignal): void {
    const { contractId, strategyName } = signal;

    if (!this.pending.has(contractId)) {
      this.pending.set(contractId, new Map());
    }

    const contractSignals = this.pending.get(contractId)!;
    contractSignals.set(strategyName, signal);

    if (contractSignals.size < this.expectedStrategyCount) {
      return;
    }

    const aggregated = aggregateSignals(
      contractId,
      Array.from(contractSignals.values()),
      this.weights,
      signal.timestamp,
    );

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
