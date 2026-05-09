import { loadConfig } from './core/config/system-config.js';
import { EventBus } from './core/event-bus/bus.js';
import { EVENTS } from './core/event-bus/events.js';
import { Logger } from './core/telemetry/logger.js';
import { MetricsRegistry } from './core/metrics/registry.js';
import { Tracer } from './core/tracing/tracer.js';
import { ApiServer } from './apps/api/server.js';
import { ResearchLabServer } from './apps/research-lab/server.js';
import { MarketDataService } from './services/market-data/service.js';
import { GlobalContextService } from './services/global-context/service.js';
import { MicrostructureEngine } from './services/microstructure-engine/service.js';
import { FeatureEngine } from './services/feature-engine/service.js';
import { FeatureIntelligenceService } from './services/feature-intelligence/service.js';
import { ProbabilityEngine } from './services/probability-engine/service.js';
import { CalibrationEngine } from './services/calibration-engine/service.js';
import { DriftEngine } from './services/drift-engine/service.js';
import { StrategyEcology } from './services/strategy-ecology/service.js';
import { SignalEngine } from './services/signal-engine/service.js';
import { AdaptiveRiskEngine } from './services/adaptive-risk/service.js';
import { ExecutionIntelligenceEngine } from './services/execution-intelligence/service.js';
import { ExecutionAlphaService } from './services/execution-alpha/service.js';
import { SimulationEngine } from './services/simulation-engine/service.js';
import { SimulationUniverseService } from './services/simulation-universe/service.js';
import { PortfolioEngine } from './services/portfolio-engine/service.js';
import { PortfolioIntelligenceService } from './services/portfolio-intelligence/service.js';
import { ReconciliationEngine } from './services/reconciliation-engine/service.js';
import { ReplayEngine } from './services/replay-engine/service.js';
import { AnomalyEngine } from './services/anomaly-engine/service.js';
import { AiIntelligenceService } from './services/ai-intelligence/service.js';
import { AiMemoryService } from './services/ai-memory/service.js';
import { AutonomousResearchService } from './services/autonomous-research/service.js';
import { OptimizationEngine } from './services/optimization-engine/service.js';
import { AiAgentRouterService } from './services/ai-orchestration/router/service.js';
import { AiAggregationService } from './services/ai-orchestration/aggregation/service.js';
import { OpenRouterProvider } from './services/ai-orchestration/providers/openrouter.js';
import { BeliefGraphService } from './services/belief-graph/service.js';
import { StrategyGenomeService } from './services/strategy-genome/service.js';
async function main() {
    const config = loadConfig();
    const bus = new EventBus();
    const logger = new Logger('god-tier-quant-system');
    const metrics = new MetricsRegistry();
    const tracer = new Tracer(bus, 'main');
    const marketData = new MarketDataService(bus, logger);
    const globalContext = new GlobalContextService(bus);
    const micro = new MicrostructureEngine(bus, logger);
    const features = new FeatureEngine(bus);
    const featureIntelligence = new FeatureIntelligenceService(bus);
    const probability = new ProbabilityEngine(bus);
    const calibration = new CalibrationEngine(bus);
    const drift = new DriftEngine(bus);
    const ecology = new StrategyEcology(bus);
    const signal = new SignalEngine(bus);
    const risk = new AdaptiveRiskEngine(bus, config.initialCapital, config.riskLimit);
    const execution = new ExecutionIntelligenceEngine(bus);
    const executionAlpha = new ExecutionAlphaService(bus);
    const simulation = new SimulationEngine(bus);
    const simulationUniverse = new SimulationUniverseService(bus);
    const portfolio = new PortfolioEngine(bus, config.initialCapital);
    const portfolioIntelligence = new PortfolioIntelligenceService(bus);
    const reconciliation = new ReconciliationEngine(bus);
    const replay = new ReplayEngine(bus);
    const anomaly = new AnomalyEngine(bus);
    const ai = new AiIntelligenceService(bus);
    const aiMemory = new AiMemoryService(bus);
    const autonomousResearch = new AutonomousResearchService(bus);
    const optimization = new OptimizationEngine(bus, ecology, signal);
    const beliefGraph = new BeliefGraphService(bus);
    const strategyGenome = new StrategyGenomeService(bus, ecology);
    const aiAggregation = new AiAggregationService(bus);
    const openRouterProvider = new OpenRouterProvider({
        apiKey: config.openRouter.apiKey,
        timeoutMs: config.openRouter.timeoutMs,
        referer: config.openRouter.referer,
        title: config.openRouter.title,
        maxTokens: config.openRouter.maxTokens,
        temperature: config.openRouter.temperature,
    });
    const aiRouter = new AiAgentRouterService(bus, openRouterProvider, {
        enabled: config.orchestration.enabled,
        defaultContractId: config.orchestration.defaultContractId,
        shadowMode: config.orchestration.shadowMode,
        scheduler: { maxParallel: config.orchestration.maxParallel },
        circuitBreaker: {
            failureThreshold: config.orchestration.circuitBreaker.failureThreshold,
            cooldownMs: config.orchestration.circuitBreaker.cooldownMs,
        },
    });
    const api = new ApiServer(bus, config.apiHost, config.apiPort);
    const researchLab = new ResearchLabServer(bus, config.apiHost, config.apiPort + 1);
    globalContext.start();
    micro.start();
    features.start();
    featureIntelligence.start();
    beliefGraph.start();
    probability.start();
    calibration.start();
    drift.start();
    ecology.start();
    strategyGenome.start();
    risk.start();
    execution.start();
    executionAlpha.start();
    simulation.start();
    simulationUniverse.start();
    optimization.start();
    signal.start();
    portfolio.start();
    portfolioIntelligence.start();
    reconciliation.start();
    replay.start();
    anomaly.start();
    ai.start();
    aiMemory.start();
    autonomousResearch.start();
    aiAggregation.start();
    aiRouter.start();
    bus.on(EVENTS.TELEMETRY, (event) => {
        metrics.record(event);
    });
    bus.on(EVENTS.AI_NARRATIVE, (event) => {
        logger.info('AI observer', event);
    });
    await api.start();
    await researchLab.start();
    marketData.start('KXBTC-DEMO');
    logger.info('god-tier-quant-system started', {
        api: `${config.apiHost}:${config.apiPort}`,
        researchLab: `${config.apiHost}:${config.apiPort + 1}`,
        aiOrchestration: config.orchestration.enabled,
        aiOrchestrationShadowMode: config.orchestration.shadowMode,
    });
    const shutdown = async () => {
        logger.info('shutting down');
        const span = tracer.startSpan('shutdown');
        marketData.stop();
        await api.stop();
        await researchLab.stop();
        tracer.endSpan(span, { status: 'ok' });
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
