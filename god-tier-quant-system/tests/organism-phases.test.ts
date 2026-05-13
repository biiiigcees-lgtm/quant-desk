import { strict as assert } from 'node:assert';
import http from 'node:http';
import { ApiServer } from '../apps/api/server.js';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ReplayEngine } from '../services/replay-engine/service.js';
import { ReplayIntegrityService } from '../services/replay-integrity/service.js';
import { StrategyGenomeService } from '../services/strategy-genome/service.js';
import { SystemConsciousnessService } from '../services/system-consciousness/service.js';
import { DigitalImmuneSystemService } from '../services/digital-immune-system/service.js';

async function requestJson(port: number, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function run(): Promise<void> {
  const bus = new EventBus();
  const api = new ApiServer(bus, '127.0.0.1', 0);
  const replay = new ReplayEngine(bus);
  const replayIntegrity = new ReplayIntegrityService(bus, replay, { minimumSampleSize: 1 });
  const strategyGenome = new StrategyGenomeService(bus);
  const consciousness = new SystemConsciousnessService(bus, { epistemicFloor: 0.35 });
  const immune = new DigitalImmuneSystemService(bus, { cooldownMs: 1 });

  replay.start();
  replayIntegrity.start();
  strategyGenome.start();
  consciousness.start();
  immune.start();
  await api.start();

  const server = (api as unknown as { server: http.Server | null }).server;
  assert.ok(server, 'API server should start');
  const address = server?.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected API server to bind to a port');
  }

  bus.emit(EVENTS.BELIEF_GRAPH_STATE, {
    contractId: 'KXBTC-DEMO',
    snapshot_id: 'snap-1',
    market_state_hash: 'hash-1',
    cycle_id: 'cycle-1',
    timestamp: Date.now(),
    summary: {
      contractId: 'KXBTC-DEMO',
      snapshot_id: 'snap-1',
      market_state_hash: 'hash-1',
      cycle_id: 'cycle-1',
      beliefAdjustedProbability: 0.58,
      beliefUncertaintyInterval: [0.5, 0.64],
      contradictions: [],
      contradictionCount: 1,
      maxContradictionStrength: 0.42,
      topHypotheses: [
        { nodeId: 'momentum-bullish', hypothesis: 'momentum-bullish', evidence: 0.73, uncertainty: 0.31, causalInfluence: 0.48 },
      ],
      regimeTransitionHazard: 0.18,
      regimeTransitionConfidence: 0.66,
      nextPredictedRegimes: ['BULL_TREND'],
      graphDensity: 0.2,
      graphEntropy: 0.24,
      strongestBeliefs: 1,
      weakestBeliefs: 0,
      timestamp: Date.now(),
    },
  });

  bus.emit(EVENTS.CALIBRATION_UPDATE, {
    contractId: 'KXBTC-DEMO',
    ece: 0.11,
    brier: 0.19,
    calibratedConfidence: 0.71,
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.DRIFT_EVENT, {
    contractId: 'KXBTC-DEMO',
    psi: 0.09,
    kl: 0.08,
    severity: 'low',
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.CONSTITUTIONAL_DECISION, {
    cycle_id: 'cycle-1',
    snapshot_id: 'snap-1',
    market_state_hash: 'hash-1',
    contractId: 'KXBTC-DEMO',
    trade_allowed: true,
    final_probability: 0.61,
    edge_score: 0.09,
    risk_level: 38,
    execution_mode: 'passive',
    regime_state: 'BULL_TREND',
    confidence_score: 0.72,
    simulation_result: {
      passed: true,
      divergenceScore: 0.1,
      scenarioCount: 128,
      tailProbability: 0.07,
      worstCasePnl: -120,
      reason: 'ok',
    },
    governance_log: [],
    agent_conflicts: [],
    agent_consensus: {
      market_confidence: 0.7,
      risk_confidence: 0.74,
      execution_confidence: 0.68,
      calibration_score: 0.73,
    },
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.RECONCILIATION, {
    strategyId: 'trend-follow-v2',
    pnl: 0.4,
    contractId: 'KXBTC-DEMO',
    positionId: 'pos-1',
    status: 'closed',
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.ANOMALY, {
    contractId: 'KXBTC-DEMO',
    type: 'volatility-spike',
    severity: 'critical',
    confidenceDegradation: 0.9,
    details: 'stress spike',
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.MARKET_PHYSICS, {
    contractId: 'KXBTC-DEMO',
    compression: 0.62,
    expansion: 0.41,
    inertia: 0.55,
    exhaustion: 0.37,
    entropyExpansion: 0.44,
    liquidityConservation: 0.59,
    structuralStress: 0.68,
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.SCENARIO_BRANCH_STATE, {
    contractId: 'KXBTC-DEMO',
    invalidated: false,
    branchScores: { baseline: 0.58, stress: 0.42 },
    dominantBranch: 'baseline',
    volatilityWeight: 0.49,
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.CROSS_MARKET_CAUSAL_STATE, {
    contractId: 'KXBTC-DEMO',
    riskTransmissionScore: 0.46,
    correlationBreakdown: {
      macroToLocal: 0.51,
      liquidityToDrift: 0.43,
      sentimentCoupling: 0.39,
    },
    dominantDriver: 'macro-to-local',
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.MARKET_WORLD_STATE, {
    contractId: 'KXBTC-DEMO',
    participantIntent: 'hedging',
    syntheticLiquidityProbability: 0.57,
    forcedPositioningPressure: 0.41,
    reflexivityAcceleration: 0.36,
    worldConfidence: 0.64,
    scenarioDominantBranch: 'baseline',
    hiddenState: 'momentum-continuation',
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.META_CALIBRATION, {
    contractId: 'KXBTC-DEMO',
    signalCalibration: 0.66,
    aiCalibration: 0.61,
    executionCalibration: 0.58,
    regimeCalibration: 0.63,
    uncertaintyCalibration: 0.54,
    compositeScore: 0.61,
    authorityDecay: 0.34,
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.OPERATOR_ATTENTION, {
    contractId: 'KXBTC-DEMO',
    focus: 'focused',
    priority: ['calibration', 'execution'],
    contradictionHotspots: ['momentum-bullish|mean-reversion-pressure'],
    density: 0.44,
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.MARKET_EXPERIENCE, {
    contractId: 'KXBTC-DEMO',
    archetype: 'liquidity-fragility-breakout',
    recurringFailureSignature: false,
    traumaPenalty: 0.22,
    retrievalConfidence: 0.58,
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.SELF_IMPROVEMENT, {
    strategyId: 'trend-follow-v2',
    contractId: 'KXBTC-DEMO',
    adaptationRate: 0.11,
    guarded: false,
    reason: 'positive reconciliation drift',
    updatedWeights: { momentum: 0.62, meanReversion: 0.38 },
    timestamp: Date.now(),
  });

  bus.emit(EVENTS.EPISTEMIC_MEMORY_REVISION, {
    contractId: 'KXBTC-DEMO',
    revisionId: 'rev-1',
    hypothesisId: 'momentum-bullish',
    previousConfidence: 0.55,
    nextConfidence: 0.61,
    reason: 'belief graph confidence update',
    lineage: ['snap-1', 'cycle-1'],
    contradictionCount: 1,
    timestamp: Date.now(),
  });

  const organism = (await requestJson(address.port, '/organism')) as {
    systemConsciousness: { executionConfidence: number } | null;
    epistemicHealth: { score: number } | null;
    digitalImmuneAlert: { recommendedMode: string } | null;
    strategyGenome: { topGenomes: Array<{ strategyId: string }> } | null;
    replayIntegrity: { deterministic: boolean } | null;
    marketPhysics: { structuralStress: number } | null;
    scenarioBranchState: { dominantBranch: string } | null;
    crossMarketCausalState: { dominantDriver: string } | null;
    marketWorldState: { participantIntent: string } | null;
    metaCalibration: { compositeScore: number } | null;
    operatorAttention: { focus: string } | null;
    selfImprovement: { strategyId: string } | null;
    epistemicMemoryRevision: { revisionId: string } | null;
  };

  assert.ok(organism.systemConsciousness, 'organism endpoint should expose consciousness');
  assert.ok(organism.epistemicHealth, 'organism endpoint should expose epistemic health');
  assert.ok(organism.strategyGenome?.topGenomes.length, 'organism endpoint should expose genome updates');
  assert.equal(organism.replayIntegrity?.deterministic, true, 'replay integrity should validate deterministic replay');
  assert.equal(organism.digitalImmuneAlert?.recommendedMode, 'hard-stop', 'immune alert should enforce hard-stop on critical anomalies');
  assert.ok(organism.marketPhysics, 'organism endpoint should expose market physics state');
  assert.equal(organism.scenarioBranchState?.dominantBranch, 'baseline', 'organism endpoint should expose scenario branch state');
  assert.equal(organism.crossMarketCausalState?.dominantDriver, 'macro-to-local', 'organism endpoint should expose cross-market state');
  assert.equal(organism.marketWorldState?.participantIntent, 'hedging', 'organism endpoint should expose market world state');
  assert.equal(organism.metaCalibration?.compositeScore, 0.61, 'organism endpoint should expose meta calibration');
  assert.equal(organism.operatorAttention?.focus, 'focused', 'organism endpoint should expose operator attention');
  assert.equal(organism.selfImprovement?.strategyId, 'trend-follow-v2', 'organism endpoint should expose self improvement stream');
  assert.equal(organism.epistemicMemoryRevision?.revisionId, 'rev-1', 'organism endpoint should expose memory revision lineage');

  const execution = (await requestJson(address.port, '/execution')) as {
    executionControl?: { mode: string; reason: string };
    metaCalibration?: { compositeScore: number };
    marketWorldState?: { participantIntent: string };
  };
  assert.equal(execution.executionControl?.mode, 'hard-stop', 'execution endpoint should reflect digital immune hard-stop');
  assert.equal(execution.metaCalibration?.compositeScore, 0.61, 'execution endpoint should expose meta calibration state');
  assert.equal(execution.marketWorldState?.participantIntent, 'hedging', 'execution endpoint should expose market world state');

  await api.stop();
  process.stdout.write('organism-phases-ok\n');
}

await run();
