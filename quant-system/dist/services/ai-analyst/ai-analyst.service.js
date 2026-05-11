import { EVENTS, } from '../../core/index.js';
import { generateNarrative } from './narrative-generator.js';
import { observeMarket } from './market-observer.js';
export class AiAnalystService {
    constructor(eventBus, logger) {
        this.latestPortfolio = null;
        this.eventBus = eventBus;
        this.logger = logger;
        this.signalListener = (signal) => this.handleSignal(signal);
        this.portfolioListener = (portfolio) => {
            this.latestPortfolio = portfolio;
        };
    }
    start() {
        this.eventBus.on(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
        this.eventBus.on(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
        this.logger.info('AI analyst service started');
    }
    stop() {
        this.eventBus.off(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
        this.eventBus.off(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
    }
    handleSignal(signal) {
        if (!this.latestPortfolio) {
            return;
        }
        const observation = observeMarket(signal, this.latestPortfolio);
        const report = generateNarrative(observation);
        this.eventBus.emit(EVENTS.ANALYST_REPORT, report);
        this.logger.debug('Analyst report', report);
    }
}
