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
import { PersistentEventLog } from './services/replay-engine/persistent-log.js';
import { AnomalyEngine } from './services/anomaly-engine/service.js';
import { AiIntelligenceService } from './services/ai-intelligence/service.js';
import { AiMemoryService } from './services/ai-memory/service.js';
import { AutonomousResearchService } from './services/autonomous-research/service.js';
import { OptimizationEngine } from './services/optimization-engine/service.js';
import { SnapshotSyncService } from './services/snapshot-sync/service.js';
import { ConstitutionalDecisionService } from './services/constitutional-decision/service.js';
import { BeliefGraphService } from './services/belief-graph/service.js';
import { SystemBeliefService } from './services/system-belief/service.js';
import { AiAgentRouterService } from './services/ai-orchestration/router/service.js';
import { AiAggregationService } from './services/ai-orchestration/aggregation/service.js';
import { OpenRouterProvider } from './services/ai-orchestration/providers/openrouter.js';
import { SystemConsciousnessService } from './services/system-consciousness/service.js';
import { DigitalImmuneSystemService } from './services/digital-immune-system/service.js';
import { StrategyGenomeService } from './services/strategy-genome/service.js';
import { ReplayIntegrityService } from './services/replay-integrity/service.js';
import { InvariantEngineService } from './services/invariant-engine/service.js';
import { RealityLayerService } from './services/reality-layer/service.js';
import { CausalWorldModelService } from './services/causal-world-model/service.js';
import { MarketParticipantModelService } from './services/market-participant-model/service.js';
import { EpistemicHealthService } from './services/epistemic-health/service.js';
import { AdversarialAuditorService } from './services/adversarial-auditor/service.js';
import { MarketMemoryService } from './services/market-memory/service.js';
import { MultiTimescaleCognitionService } from './services/multiscale-cognition/service.js';
import { MarketPhysicsService } from './services/market-physics/service.js';
import { MarketWorldModelService } from './services/market-world-model/service.js';
import { MetaCalibrationService } from './services/meta-calibration/service.js';
import { OperatorAttentionService } from './services/operator-attention/service.js';
import { MarketDataIntegrityService } from './services/market-data-integrity/service.js';
import { MemoryLifecycleManager } from './core/memory/lifecycle.js';
import { OrderbookDeltaService } from './services/orderbook-delta/service.js';
import { LiquidityGravityService } from './services/liquidity-gravity/service.js';
import { RegimeTransitionService } from './services/regime-transition/service.js';
import { NoiseFilterService } from './services/noise-filter/service.js';
import { RealityAlignmentService } from './services/reality-alignment/service.js';
import { CausalWeightEngine } from './services/causal-weight-engine/service.js';
import { UnifiedMarketFieldService } from './services/unified-market-field/service.js';
import { ShadowTradingService } from './services/shadow-trading/service.js';
import { ReplayStorage } from './core/replay/storage.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const bus = new EventBus();
  const logger = new Logger('god-tier-quant-system');
  const metrics = new MetricsRegistry();
  const tracer = new Tracer(bus, 'main');
  const replayStorage = new ReplayStorage(config.replay.logPath, {
    maxFileSizeBytes: config.replay.maxFileSizeBytes,
    maxArchivedFiles: config.replay.maxArchivedFiles,
  });
  const persistentEventLog = new PersistentEventLog(bus, replayStorage);
  const hydratedEvents = await persistentEventLog.hydrateBus();

  const marketData = new MarketDataService(bus, logger);
  const marketDataIntegrity = new MarketDataIntegrityService(bus);
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
  const snapshotSync = new SnapshotSyncService(bus, {
    defaultContractId: config.orchestration.defaultContractId,
    maxSourceAgeMs: config.snapshot.maxSourceAgeMs,
    maxClockDriftMs: config.snapshot.maxClockDriftMs,
  });
  const beliefGraph = new BeliefGraphService(bus);
  const systemBelief = new SystemBeliefService(bus);
  const constitutionalDecision = new ConstitutionalDecisionService(bus);
  const aiAggregation = new AiAggregationService(bus);
  const consciousness = new SystemConsciousnessService(bus, {
    epistemicFloor: config.organism.epistemicFloor,
  });
  const immuneSystem = new DigitalImmuneSystemService(bus, {
    cooldownMs: config.organism.immuneCooldownMs,
  });
  const strategyGenome = new StrategyGenomeService(bus);
  const replayIntegrity = new ReplayIntegrityService(bus, replay, {
    minimumSampleSize: config.organism.replayValidationMinSamples,
  });
  const invariantEngine = new InvariantEngineService(bus);
  const realityLayer = new RealityLayerService(bus);
  const causalWorldModel = new CausalWorldModelService(bus);
  const participantModel = new MarketParticipantModelService(bus);
  const epistemicHealth = new EpistemicHealthService(bus);
  const adversarialAuditor = new AdversarialAuditorService(bus);
  const marketMemory = new MarketMemoryService(bus);
  const multiTimescale = new MultiTimescaleCognitionService(bus);
  const marketPhysics = new MarketPhysicsService(bus);
  const marketWorldModel = new MarketWorldModelService(bus);
  const metaCalibration = new MetaCalibrationService(bus);
  const operatorAttention = new OperatorAttentionService(bus);
  const memoryLifecycle = new MemoryLifecycleManager();
  const orderbookDelta = new OrderbookDeltaService(bus);
  const liquidityGravity = new LiquidityGravityService(bus);
  const regimeTransition = new RegimeTransitionService(bus);
  const noiseFilter = new NoiseFilterService(bus);
  const realityAlignment = new RealityAlignmentService(bus);
  const causalWeightEngine = new CausalWeightEngine(bus);
  const unifiedMarketField = new UnifiedMarketFieldService(bus);
  const shadowTrading = new ShadowTradingService(bus);
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
  const api = new ApiServer(bus, config.apiHost, config.apiPort, unifiedMarketField);
  const researchLab = new ResearchLabServer(bus, config.apiHost, config.apiPort + 1);

  globalContext.start();
  marketDataIntegrity.start();
  micro.start();
  features.start();
  featureIntelligence.start();
  probability.start();
  calibration.start();
  drift.start();
  ecology.start();
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
  beliefGraph.start();
  systemBelief.start();
  realityLayer.start();
  causalWorldModel.start();
  participantModel.start();
  epistemicHealth.start();
  adversarialAuditor.start();
  marketMemory.start();
  multiTimescale.start();
  marketPhysics.start();
  marketWorldModel.start();
  metaCalibration.start();
  operatorAttention.start();
  constitutionalDecision.start();
  consciousness.start();
  immuneSystem.start();
  strategyGenome.start();
  replayIntegrity.start();
  invariantEngine.start();
  autonomousResearch.start();
  aiAggregation.start();
  snapshotSync.start();
  aiRouter.start();
  // Unified Causal Market Physics Engine — starts after all upstream services
  orderbookDelta.start();
  liquidityGravity.start();
  noiseFilter.start();
  regimeTransition.start();
  causalWeightEngine.start();
  realityAlignment.start();
  unifiedMarketField.start();
  shadowTrading.start();
  memoryLifecycle.start(5 * 60 * 1000);
  persistentEventLog.start();

  bus.on(EVENTS.TELEMETRY, (event: { name: string; value: number; tags?: Record<string, string>; timestamp: number }) => {
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
    replayHydratedEvents: hydratedEvents,
    replayLogPath: config.replay.logPath,
  });

  const shutdown = async () => {
    logger.info('shutting down');
    const span = tracer.startSpan('shutdown');
    marketData.stop();
    persistentEventLog.stop();
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
} catch (error) {
  console.error(error);
  process.exit(1);
}
