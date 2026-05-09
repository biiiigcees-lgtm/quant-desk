import {
  EventBus,
  EVENTS,
  Logger,
  FeatureVector,
  MarketUpdate,
} from '../../core/index.js';
import { computeFeatureVector } from './feature-vector.js';
import { ProbabilityVelocityCalculator } from './probability-velocity.js';

export class FeatureEngineService {
  private eventBus: EventBus;
  private logger: Logger;
  private priceHistories: Map<string, number[]> = new Map();
  private velocityCalculators: Map<string, ProbabilityVelocityCalculator> = new Map();
  private expiryTimes: Map<string, number> = new Map();
  private maxHistoryLength: number;
  private emaPeriods: { short: number; long: number };

  constructor(
    eventBus: EventBus,
    logger: Logger,
    maxHistoryLength: number = 100,
    emaPeriods: { short: number; long: number } = { short: 3, long: 21 },
  ) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.maxHistoryLength = maxHistoryLength;
    this.emaPeriods = emaPeriods;
  }

  start(): void {
    this.eventBus.on(EVENTS.MARKET_UPDATE, (update: MarketUpdate) => {
      this.handleMarketUpdate(update);
    });

    this.logger.info('Feature engine service started');
  }

  setContractExpiry(contractId: string, expiryTimestamp: number): void {
    this.expiryTimes.set(contractId, expiryTimestamp);
  }

  private handleMarketUpdate(update: MarketUpdate): void {
    try {
      // Initialize history if needed
      if (!this.priceHistories.has(update.contractId)) {
        this.priceHistories.set(update.contractId, []);
        this.velocityCalculators.set(update.contractId, new ProbabilityVelocityCalculator());
      }

      // Update price history
      const history = this.priceHistories.get(update.contractId)!;
      history.push(update.yesPrice);
      if (history.length > this.maxHistoryLength) {
        history.shift();
      }

      // Calculate probability velocity
      const calculator = this.velocityCalculators.get(update.contractId)!;
      const probVelocity = calculator.update(update.impliedProb, update.timestamp);

      // Calculate time decay
      const expiryTime = this.expiryTimes.get(update.contractId) || Date.now() + 900000; // default 15min
      const timeDecaySeconds = Math.max(0, (expiryTime - update.timestamp) / 1000);

      // Compute feature vector
      const featureVector = computeFeatureVector(
        update,
        history,
        this.emaPeriods,
        probVelocity,
        timeDecaySeconds,
      );

      this.eventBus.emit(EVENTS.FEATURE_VECTOR, featureVector);
    } catch (e) {
      this.logger.error('Failed to compute feature vector', { error: String(e) });
      this.eventBus.emit(EVENTS.FEATURE_ERROR, {
        contractId: update.contractId,
        error: String(e),
      });
    }
  }

  stop(): void {
    this.eventBus.off(EVENTS.MARKET_UPDATE, () => {});
  }
}
