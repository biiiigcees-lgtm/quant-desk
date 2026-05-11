import { EVENTS, } from '../../core/index.js';
import { computeFeatureVector } from './feature-vector.js';
import { ProbabilityVelocityCalculator } from './probability-velocity.js';
export class FeatureEngineService {
    constructor(eventBus, logger, maxHistoryLength = 100, emaPeriods = { short: 3, long: 21 }) {
        this.priceHistories = new Map();
        this.velocityCalculators = new Map();
        this.expiryTimes = new Map();
        this.eventBus = eventBus;
        this.logger = logger;
        this.maxHistoryLength = maxHistoryLength;
        this.emaPeriods = emaPeriods;
    }
    start() {
        this.eventBus.on(EVENTS.MARKET_UPDATE, (update) => {
            this.handleMarketUpdate(update);
        });
        this.logger.info('Feature engine service started');
    }
    setContractExpiry(contractId, expiryTimestamp) {
        this.expiryTimes.set(contractId, expiryTimestamp);
    }
    handleMarketUpdate(update) {
        try {
            // Initialize history if needed
            if (!this.priceHistories.has(update.contractId)) {
                this.priceHistories.set(update.contractId, []);
                this.velocityCalculators.set(update.contractId, new ProbabilityVelocityCalculator());
            }
            // Update price history
            const history = this.priceHistories.get(update.contractId);
            history.push(update.yesPrice);
            if (history.length > this.maxHistoryLength) {
                history.shift();
            }
            // Calculate probability velocity
            const calculator = this.velocityCalculators.get(update.contractId);
            const probVelocity = calculator.update(update.impliedProb, update.timestamp);
            // Calculate time decay
            const expiryTime = this.expiryTimes.get(update.contractId) || Date.now() + 900000; // default 15min
            const timeDecaySeconds = Math.max(0, (expiryTime - update.timestamp) / 1000);
            // Compute feature vector
            const featureVector = computeFeatureVector(update, history, this.emaPeriods, probVelocity, timeDecaySeconds);
            this.eventBus.emit(EVENTS.FEATURE_VECTOR, featureVector);
        }
        catch (e) {
            this.logger.error('Failed to compute feature vector', { error: String(e) });
            this.eventBus.emit(EVENTS.FEATURE_ERROR, {
                contractId: update.contractId,
                error: String(e),
            });
        }
    }
    stop() {
        this.eventBus.off(EVENTS.MARKET_UPDATE, () => { });
    }
}
