import { loadConfig } from './core/config/system-config.js';
import { EventBus } from './core/event-bus/bus.js';
import { EVENTS } from './core/event-bus/events.js';
import { Logger } from './core/telemetry/logger.js';
import { MetricsRegistry } from './core/metrics/registry.js';
import { ApiServer } from './apps/api/server.js';
import { MarketDataService } from './services/market-data/service.js';
import { MicrostructureEngine } from './services/microstructure-engine/service.js';
import { FeatureEngine } from './services/feature-engine/service.js';
import { ProbabilityEngine } from './services/probability-engine/service.js';
import { StrategyEcology } from './services/strategy-ecology/service.js';
import { SignalEngine } from './services/signal-engine/service.js';
import { AdaptiveRiskEngine } from './services/adaptive-risk/service.js';
import { ExecutionIntelligenceEngine } from './services/execution-intelligence/service.js';
import { SimulationEngine } from './services/simulation-engine/service.js';
import { PortfolioEngine } from './services/portfolio-engine/service.js';
import { ReconciliationEngine } from './services/reconciliation-engine/service.js';
import { ReplayEngine } from './services/replay-engine/service.js';
import { AnomalyEngine } from './services/anomaly-engine/service.js';
import { AiIntelligenceService } from './services/ai-intelligence/service.js';
import { OptimizationEngine } from './services/optimization-engine/service.js';
async function main() {
    const config = loadConfig();
    const bus = new EventBus();
    const logger = new Logger('quant-god-engine');
    const metrics = new MetricsRegistry();
    const marketData = new MarketDataService(bus, logger);
    const micro = new MicrostructureEngine(bus, logger);
    const features = new FeatureEngine(bus);
    const probability = new ProbabilityEngine(bus);
    const ecology = new StrategyEcology(bus);
    const signal = new SignalEngine(bus);
    const risk = new AdaptiveRiskEngine(bus, config.initialCapital, config.riskLimit);
    const execution = new ExecutionIntelligenceEngine(bus);
    const simulation = new SimulationEngine(bus);
    const portfolio = new PortfolioEngine(bus, config.initialCapital);
    const reconciliation = new ReconciliationEngine(bus);
    const replay = new ReplayEngine(bus);
    const anomaly = new AnomalyEngine(bus);
    const ai = new AiIntelligenceService(bus);
    const optimization = new OptimizationEngine(bus, ecology, signal);
    const api = new ApiServer(bus, config.apiHost, config.apiPort);
    micro.start();
    features.start();
    probability.start();
    ecology.start();
    signal.start();
    risk.start();
    execution.start();
    simulation.start();
    portfolio.start();
    reconciliation.start();
    replay.start();
    anomaly.start();
    ai.start();
    optimization.start();
    bus.on(EVENTS.TELEMETRY, (event) => {
        metrics.record(event);
    });
    bus.on(EVENTS.AI_NARRATIVE, (event) => {
        logger.info('AI observer', event);
    });
    await api.start();
    marketData.start('KXBTC-DEMO');
    logger.info('quant-god-engine started', { api: `${config.apiHost}:${config.apiPort}` });
    const shutdown = async () => {
        logger.info('shutting down');
        marketData.stop();
        await api.stop();
        process.exit(0);
    };
    process.on('SIGINT', () => {
        void shutdown();
    });
    process.on('SIGTERM', () => {
        void shutdown();
    });
}
try {
    await main();
}
catch (error) {
    console.error(error);
    process.exit(1);
}
