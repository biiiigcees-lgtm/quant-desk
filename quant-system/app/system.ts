import { EventBus, EVENTS, loadConfig, Logger } from '../core/index.js';
import { ApiService } from '../api/index.js';
import { FeatureEngineService } from '../services/feature-engine/index.js';
import { KalshiClient, MarketDataService } from '../services/market-data/index.js';
import { SignalEngineService } from '../services/signal-aggregation/index.js';
import { StrategyEngineService } from '../services/strategy-engine/index.js';
import { RiskEngineService } from '../services/risk-engine/index.js';
import { ExecutionService, KalshiOrderClient } from '../services/execution-engine/index.js';
import { PositionEngineService } from '../services/position-engine/index.js';
import { AiAnalystService } from '../services/ai-analyst/index.js';

export interface RunningSystem {
  eventBus: EventBus;
  logger: Logger;
  stop: () => Promise<void>;
}

export async function startSystem(): Promise<RunningSystem> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const eventBus = new EventBus();

  const kalshiClient = new KalshiClient(config.kalshi.wsUrl, logger);
  const marketDataService = new MarketDataService(
    eventBus,
    kalshiClient,
    logger,
    config.kalshi.contractIds,
  );

  const featureEngineService = new FeatureEngineService(
    eventBus,
    logger,
    config.features.priceHistoryLength,
    {
      short: config.features.emaShortPeriod,
      long: config.features.emaLongPeriod,
    },
  );

  const strategyEngineService = new StrategyEngineService(eventBus, logger);

  const signalEngineService = new SignalEngineService(eventBus, logger, {
    Momentum: config.strategies.momentumWeight,
    MeanReversion: config.strategies.meanReversionWeight,
    Liquidity: config.strategies.liquidityWeight,
    TimeDecay: config.strategies.timeDecayWeight,
  });

  const riskEngineService = new RiskEngineService(eventBus, logger, config.trading);
  const orderClient = new KalshiOrderClient(config.simulationMode, logger);
  const executionService = new ExecutionService(eventBus, logger, orderClient);
  const positionEngineService = new PositionEngineService(eventBus, logger, config.trading.initialBank);
  const aiAnalystService = new AiAnalystService(eventBus, logger);

  let apiService: ApiService | null = null;
  if (config.api.enabled) {
    apiService = new ApiService(eventBus, logger, config.api.host, config.api.port);
  }

  featureEngineService.start();
  strategyEngineService.start();
  signalEngineService.start();
  riskEngineService.start();
  executionService.start();
  positionEngineService.start();
  aiAnalystService.start();

  eventBus.on(EVENTS.ANALYST_REPORT, (report) => {
    logger.info('Analyst report', report);
  });

  eventBus.on(EVENTS.AGGREGATED_SIGNAL, (signal) => {
    logger.info('Aggregated trading signal', signal);
  });

  if (apiService) {
    await apiService.start();
  }

  await marketDataService.start();

  logger.info('Quant system started', {
    contracts: config.kalshi.contractIds,
    simulationMode: config.simulationMode,
    apiEnabled: config.api.enabled,
  });

  const stop = async (): Promise<void> => {
    logger.info('Shutting down quant system');
    marketDataService.stop();
    featureEngineService.stop();
    strategyEngineService.stop();
    signalEngineService.stop();
    riskEngineService.stop();
    executionService.stop();
    positionEngineService.stop();
    aiAnalystService.stop();
    if (apiService) {
      await apiService.stop();
    }
    eventBus.emit(EVENTS.SYSTEM_SHUTDOWN, { timestamp: Date.now() });
  };

  return { eventBus, logger, stop };
}
