import { EVENTS, } from '../../core/index.js';
import { createInitialPortfolioState, normalizePortfolioState } from './portfolio-state.js';
import { calculateLimitPrice, calculateRequestedSize, estimateExposureAfterTrade, } from './risk-calculator.js';
import { validateRiskLimits, validateSignalThresholds } from './risk-rules.js';
export class RiskEngineService {
    constructor(eventBus, logger, trading, initialPortfolio) {
        this.eventBus = eventBus;
        this.logger = logger;
        this.trading = trading;
        this.portfolio = normalizePortfolioState(initialPortfolio, trading.initialBank);
        this.signalListener = (signal) => this.handleAggregatedSignal(signal);
        this.portfolioListener = (state) => {
            this.portfolio = state;
        };
    }
    start() {
        this.eventBus.on(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
        this.eventBus.on(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
        this.logger.info('Risk engine service started');
    }
    stop() {
        this.eventBus.off(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
        this.eventBus.off(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
    }
    getPortfolioSnapshot() {
        return this.portfolio;
    }
    resetPortfolio(initialBank) {
        this.portfolio = createInitialPortfolioState(initialBank ?? this.trading.initialBank);
        this.eventBus.emit(EVENTS.PORTFOLIO_UPDATE, this.portfolio);
    }
    handleAggregatedSignal(signal) {
        const thresholdResult = validateSignalThresholds(signal, this.trading);
        const riskResult = validateRiskLimits(this.portfolio, this.trading);
        const requestedSize = calculateRequestedSize(signal, this.portfolio, this.trading);
        const projectedExposure = estimateExposureAfterTrade(this.portfolio, requestedSize);
        const exposureCap = this.portfolio.bank * 0.2;
        let approved = thresholdResult.approved && riskResult.approved;
        let reason = approved ? 'Approved' : [thresholdResult.reason, riskResult.reason].join('; ');
        if (projectedExposure > exposureCap) {
            approved = false;
            reason = 'Projected exposure exceeds 20% cap';
        }
        if (requestedSize <= 0) {
            approved = false;
            reason = 'Requested size is zero';
        }
        const decision = {
            contractId: signal.contractId,
            direction: signal.finalSignal === 'NO' ? 'NO' : 'YES',
            score: signal.score,
            requestedSize,
            approved,
            reason,
            approvedSize: approved ? requestedSize : 0,
            limitPrice: calculateLimitPrice(signal),
            timestamp: Date.now(),
        };
        this.eventBus.emit(EVENTS.RISK_DECISION, decision);
        if (!approved) {
            this.logger.debug('Risk decision rejected', decision);
        }
    }
}
