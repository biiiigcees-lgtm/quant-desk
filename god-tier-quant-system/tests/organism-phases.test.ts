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

  const organism = (await requestJson(address.port, '/organism')) as {
    systemConsciousness: { executionConfidence: number } | null;
    epistemicHealth: { score: number } | null;
    digitalImmuneAlert: { recommendedMode: string } | null;
    strategyGenome: { topGenomes: Array<{ strategyId: string }> } | null;
    replayIntegrity: { deterministic: boolean } | null;
  };

  assert.ok(organism.systemConsciousness, 'organism endpoint should expose consciousness');
  assert.ok(organism.epistemicHealth, 'organism endpoint should expose epistemic health');
  assert.ok(organism.strategyGenome?.topGenomes.length, 'organism endpoint should expose genome updates');
  assert.equal(organism.replayIntegrity?.deterministic, true, 'replay integrity should validate deterministic replay');
  assert.equal(organism.digitalImmuneAlert?.recommendedMode, 'hard-stop', 'immune alert should enforce hard-stop on critical anomalies');

  const execution = (await requestJson(address.port, '/execution')) as {
    executionControl?: { mode: string; reason: string };
  };
  assert.equal(execution.executionControl?.mode, 'hard-stop', 'execution endpoint should reflect digital immune hard-stop');

  await api.stop();
  process.stdout.write('organism-phases-ok\n');
}

await run();
