import {
  AggregatedSignal,
  AnalystReport,
  EventBus,
  EVENTS,
  Logger,
  PortfolioState,
} from '../../core/index.js';
import { generateNarrative } from './narrative-generator.js';
import { observeMarket } from './market-observer.js';

export class AiAnalystService {
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private latestPortfolio: PortfolioState | null = null;
  private readonly signalListener: (signal: AggregatedSignal) => void;
  private readonly portfolioListener: (portfolio: PortfolioState) => void;

  constructor(eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.signalListener = (signal) => this.handleSignal(signal);
    this.portfolioListener = (portfolio) => {
      this.latestPortfolio = portfolio;
    };
  }

  start(): void {
    this.eventBus.on(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
    this.eventBus.on(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
    this.logger.info('AI analyst service started');
  }

  stop(): void {
    this.eventBus.off(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
    this.eventBus.off(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
  }

  private handleSignal(signal: AggregatedSignal): void {
    if (!this.latestPortfolio) {
      return;
    }

    const observation = observeMarket(signal, this.latestPortfolio);
    const report: AnalystReport = generateNarrative(observation);

    this.eventBus.emit(EVENTS.ANALYST_REPORT, report);
    this.logger.debug('Analyst report', report);
  }
}
