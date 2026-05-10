import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { BeliefGraphService } from '../services/belief-graph/service.js';
import { StrategyGenomeService } from '../services/strategy-genome/service.js';
import { StrategyEcology } from '../services/strategy-ecology/service.js';
import { SimulationUniverseService } from '../services/simulation-universe/service.js';
import type {
  BeliefGraphEvent,
  StrategyLifecycleEvent,
  ValidationResultEvent,
  SimulationUniverseEvent,
  ExecutionPathMirrorEvent,
} from '../core/schemas/events.js';

// ─── BeliefGraphService ───────────────────────────────────────────────────────

function testBeliefGraphEmitsOnMicrostructure(): void {
  const bus = new EventBus();
  const service = new BeliefGraphService(bus);
  service.start();

  const events: BeliefGraphEvent[] = [];
  bus.on<BeliefGraphEvent>(EVENTS.BELIEF_GRAPH_UPDATE, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, {
    contractId: 'KXBTC-BG1',
    obi: 0.3,
    obiVelocity: 0.1,
    liquidityPressureScore: 0.2,
    spreadExpansionScore: 0.1,
    sweepProbability: 0.6,
    panicRepricing: false,
    liquidityRegime: 'normal',
    aggressionScore: 0.4,
    timestamp: 1,
  });

  assert.equal(events.length, 1, 'should emit one BELIEF_GRAPH_UPDATE on microstructure event');
  assert.equal(events[0]!.contractId, 'KXBTC-BG1', 'contractId should match emitted event');
  assert.ok(events[0]!.nodes.length > 0, 'nodes array should be non-empty');
  assert.equal(events[0]!.nodes[0]!.type, 'microstructure', 'first node type should be microstructure');
}

function testBeliefGraphCalibrationNode(): void {
  const bus = new EventBus();
  const service = new BeliefGraphService(bus);
  service.start();

  const events: BeliefGraphEvent[] = [];
  bus.on<BeliefGraphEvent>(EVENTS.BELIEF_GRAPH_UPDATE, (e) => { events.push(e); });

  bus.emit(EVENTS.CALIBRATION_UPDATE, {
    contractId: 'KXBTC-BG2',
    ece: 0.05,
    brier: 0.10,
    calibratedConfidence: 0.75,
    timestamp: 2,
  });

  assert.equal(events.length, 1, 'should emit BELIEF_GRAPH_UPDATE on calibration event');
  const node = events[0]!.nodes.find((n) => n.type === 'calibration');
  assert.ok(node !== undefined, 'should have a calibration node');
  assert.ok(node!.belief >= 0.01 && node!.belief <= 0.99, 'belief should be clamped to [0.01, 0.99]');
}

function testBeliefGraphAllFourNodeTypes(): void {
  const bus = new EventBus();
  const service = new BeliefGraphService(bus);
  service.start();

  const events: BeliefGraphEvent[] = [];
  bus.on<BeliefGraphEvent>(EVENTS.BELIEF_GRAPH_UPDATE, (e) => { events.push(e); });

  bus.emit(EVENTS.MICROSTRUCTURE, {
    contractId: 'KXBTC-BG3', obi: 0.2, obiVelocity: 0.0, liquidityPressureScore: 0.1,
    spreadExpansionScore: 0.05, sweepProbability: 0.4, panicRepricing: false,
    liquidityRegime: 'normal', aggressionScore: 0.3, timestamp: 10,
  });
  bus.emit(EVENTS.CALIBRATION_UPDATE, {
    contractId: 'KXBTC-BG3', ece: 0.08, brier: 0.15, calibratedConfidence: 0.72, timestamp: 11,
  });
  bus.emit(EVENTS.DRIFT_EVENT, {
    contractId: 'KXBTC-BG3', psi: 0.1, kl: 0.05, severity: 'low', timestamp: 12,
  });
  bus.emit(EVENTS.ANOMALY, {
    contractId: 'KXBTC-BG3', type: 'volatility-spike', severity: 'medium',
    confidenceDegradation: 0.2, details: 'test spike', timestamp: 13,
  });

  const last = events.at(-1)!;
  const types = last.nodes.map((n) => n.type);
  assert.ok(types.includes('microstructure'), 'should have microstructure node');
  assert.ok(types.includes('calibration'), 'should have calibration node');
  assert.ok(types.includes('drift'), 'should have drift node');
  assert.ok(types.includes('anomaly'), 'should have anomaly node');
}

function testBeliefGraphConstitutionalAndConfidenceBounds(): void {
  const bus = new EventBus();
  const service = new BeliefGraphService(bus);
  service.start();

  const events: BeliefGraphEvent[] = [];
  bus.on<BeliefGraphEvent>(EVENTS.BELIEF_GRAPH_UPDATE, (e) => { events.push(e); });

  // Extreme bullish signal: obi=1.0, sweep=1.0, spread=0.0 (max belief, max confidence)
  bus.emit(EVENTS.MICROSTRUCTURE, {
    contractId: 'KXBTC-BG4', obi: 1.0, obiVelocity: 1.0, liquidityPressureScore: 1.0,
    spreadExpansionScore: 0.0, sweepProbability: 1.0, panicRepricing: false,
    liquidityRegime: 'normal', aggressionScore: 1.0, timestamp: 20,
  });
  // Extreme bearish signal: high drift, high severity anomaly
  bus.emit(EVENTS.DRIFT_EVENT, {
    contractId: 'KXBTC-BG5', psi: 1.0, kl: 1.0, severity: 'high', timestamp: 21,
  });

  for (const event of events) {
    // Max possible: (0.99 - 0.5) * 1.0 * 0.18 = 0.0882; use 0.09 as safe bound
    assert.ok(
      event.constitutionalAdjustment >= -0.09 && event.constitutionalAdjustment <= 0.09,
      `constitutionalAdjustment ${event.constitutionalAdjustment} should be within [-0.09, 0.09]`,
    );
    assert.ok(
      event.graphConfidence >= 0 && event.graphConfidence <= 1,
      `graphConfidence ${event.graphConfidence} should be in [0, 1]`,
    );
  }
}

// ─── StrategyGenomeService ────────────────────────────────────────────────────

function testGenomeNoLifecycleEventWhileInBirth(): void {
  const bus = new EventBus();
  const ecology = new StrategyEcology(bus);
  ecology.start();
  const genome = new StrategyGenomeService(bus, ecology);
  genome.start();

  const lifecycle: StrategyLifecycleEvent[] = [];
  bus.on<StrategyLifecycleEvent>(EVENTS.STRATEGY_LIFECYCLE, (e) => { lifecycle.push(e); });

  // Only 1 validation — needs 5 to graduate; stays in birth
  bus.emit(EVENTS.VALIDATION_RESULT, {
    contractId: 'KXBTC-GEN1', strategyId: 'strat-1',
    kind: 'walk-forward', status: 'pass', score: 80, details: '', timestamp: 100,
  });

  assert.equal(lifecycle.length, 0, 'should not emit lifecycle event while still in birth phase');
}

function testGenomeGraduatesToGrowthAfterFivePasses(): void {
  const bus = new EventBus();
  const ecology = new StrategyEcology(bus);
  ecology.start();
  const genome = new StrategyGenomeService(bus, ecology);
  genome.start();

  const lifecycle: StrategyLifecycleEvent[] = [];
  bus.on<StrategyLifecycleEvent>(EVENTS.STRATEGY_LIFECYCLE, (e) => { lifecycle.push(e); });

  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.VALIDATION_RESULT, {
      contractId: 'KXBTC-GEN2', strategyId: 'strat-2',
      kind: 'walk-forward', status: 'pass', score: 80, details: '', timestamp: 200 + i,
    });
  }

  assert.equal(lifecycle.length, 1, 'should emit exactly one lifecycle transition');
  assert.equal(lifecycle[0]!.phase, 'growth', 'should transition to growth');
  assert.equal(lifecycle[0]!.previousPhase, 'birth', 'previous phase should be birth');
  assert.equal(lifecycle[0]!.strategyId, 'strat-2', 'strategyId should match');
}

function testGenomeDecayOnProlongedPoorPerformance(): void {
  const bus = new EventBus();
  const ecology = new StrategyEcology(bus);
  ecology.start();
  const genome = new StrategyGenomeService(bus, ecology);
  genome.start();

  const lifecycle: StrategyLifecycleEvent[] = [];
  bus.on<StrategyLifecycleEvent>(EVENTS.STRATEGY_LIFECYCLE, (e) => { lifecycle.push(e); });

  // Graduate to growth first
  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.VALIDATION_RESULT, {
      contractId: 'KXBTC-GEN3', strategyId: 'strat-3',
      kind: 'walk-forward', status: 'pass', score: 80, details: '', timestamp: 300 + i,
    });
  }

  // Send enough failing validations to push auditScore below 45 or hit 4 consecutive fails
  for (let i = 0; i < 10; i++) {
    bus.emit(EVENTS.VALIDATION_RESULT, {
      contractId: 'KXBTC-GEN3', strategyId: 'strat-3',
      kind: 'walk-forward', status: 'fail', score: 5, details: '', timestamp: 310 + i,
    });
  }

  const decayEvent = lifecycle.find((e) => e.phase === 'decay');
  assert.ok(decayEvent !== undefined, 'should eventually transition to decay under prolonged poor performance');
}

function testGenomeExtinctionIsTerminal(): void {
  const bus = new EventBus();
  const ecology = new StrategyEcology(bus);
  ecology.start();
  const genome = new StrategyGenomeService(bus, ecology);
  genome.start();

  const lifecycle: StrategyLifecycleEvent[] = [];
  bus.on<StrategyLifecycleEvent>(EVENTS.STRATEGY_LIFECYCLE, (e) => { lifecycle.push(e); });

  // Graduate to growth, then drive into extinction with 8 consecutive fails at score=0
  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.VALIDATION_RESULT, {
      contractId: 'KXBTC-GEN4', strategyId: 'strat-4',
      kind: 'walk-forward', status: 'pass', score: 80, details: '', timestamp: 400 + i,
    });
  }
  for (let i = 0; i < 8; i++) {
    bus.emit(EVENTS.VALIDATION_RESULT, {
      contractId: 'KXBTC-GEN4', strategyId: 'strat-4',
      kind: 'walk-forward', status: 'fail', score: 0, details: '', timestamp: 410 + i,
    });
  }

  const extinctEvent = lifecycle.find((e) => e.phase === 'extinction');
  assert.ok(extinctEvent !== undefined, 'should reach extinction after sustained catastrophic failure');

  // Extinct strategies must not recover — subsequent passes should not emit any lifecycle event
  const countAtExtinction = lifecycle.length;
  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.VALIDATION_RESULT, {
      contractId: 'KXBTC-GEN4', strategyId: 'strat-4',
      kind: 'walk-forward', status: 'pass', score: 90, details: '', timestamp: 420 + i,
    });
  }

  assert.equal(
    lifecycle.length,
    countAtExtinction,
    'extinct strategy should not emit any further lifecycle events',
  );
}

// ─── SimulationUniverseService ────────────────────────────────────────────────

function testSimUniverseEmitsBothValidationsOnSignal(): void {
  const bus = new EventBus();
  const sim = new SimulationUniverseService(bus);
  sim.start();

  const validations: ValidationResultEvent[] = [];
  bus.on<ValidationResultEvent>(EVENTS.VALIDATION_RESULT, (e) => { validations.push(e); });

  bus.emit(EVENTS.STRATEGY_SIGNAL, {
    strategyId: 'strat-sim1', contractId: 'KXBTC-SIM1',
    direction: 'YES', confidence: 0.72, expectedValue: 0.05,
    regime: 'trending', rationale: 'test', timestamp: 500,
  });

  assert.equal(validations.length, 2, 'should emit both walk-forward and adversarial results');
  assert.ok(validations.some((v) => v.kind === 'walk-forward'), 'should include walk-forward validation');
  assert.ok(validations.some((v) => v.kind === 'adversarial'), 'should include adversarial validation');
  assert.equal(validations[0]!.strategyId, 'strat-sim1', 'strategyId should propagate');
}

function testSimUniverseWalkForwardPassOnConfidentSignal(): void {
  const bus = new EventBus();
  const sim = new SimulationUniverseService(bus);
  sim.start();

  const validations: ValidationResultEvent[] = [];
  bus.on<ValidationResultEvent>(EVENTS.VALIDATION_RESULT, (e) => { validations.push(e); });

  // confidence=0.80, expectedValue=0.02 → walkForwardScore = 80 - 0.8 = 79.2 → pass (≥45 & conf≥0.55)
  bus.emit(EVENTS.STRATEGY_SIGNAL, {
    strategyId: 'strat-sim2', contractId: 'KXBTC-SIM2',
    direction: 'YES', confidence: 0.80, expectedValue: 0.02,
    regime: 'trending', rationale: 'test', timestamp: 510,
  });

  const wf = validations.find((v) => v.kind === 'walk-forward');
  assert.ok(wf !== undefined, 'walk-forward result should exist');
  assert.equal(wf!.status, 'pass', 'high-confidence signal should pass walk-forward validation');
}

function testSimUniverseAdversarialPanicPenalty(): void {
  const bus = new EventBus();
  const sim = new SimulationUniverseService(bus);
  sim.start();

  const validations: ValidationResultEvent[] = [];
  bus.on<ValidationResultEvent>(EVENTS.VALIDATION_RESULT, (e) => { validations.push(e); });

  // panic penalty=30, confidence=0.50 → adversarialScore = 50 - 30 = 20 (<40 so not pass)
  bus.emit(EVENTS.STRATEGY_SIGNAL, {
    strategyId: 'strat-sim3', contractId: 'KXBTC-SIM3',
    direction: 'YES', confidence: 0.50, expectedValue: 0.02,
    regime: 'panic', rationale: 'test', timestamp: 520,
  });

  const adv = validations.find((v) => v.kind === 'adversarial');
  assert.ok(adv !== undefined, 'adversarial result should exist');
  assert.ok(adv!.score < 40, `panic regime should reduce score below passing threshold; got ${adv!.score}`);
}

function testSimUniverseEmitsUniverseOnAggregatedSignal(): void {
  const bus = new EventBus();
  const sim = new SimulationUniverseService(bus);
  sim.start();

  const universe: SimulationUniverseEvent[] = [];
  bus.on<SimulationUniverseEvent>(EVENTS.SIMULATION_UNIVERSE, (e) => { universe.push(e); });

  bus.emit(EVENTS.AGGREGATED_SIGNAL, {
    contractId: 'KXBTC-SIM4', direction: 'YES', score: 0.75, agreement: 0.85,
    strategyWeights: {}, strategySignals: [], regime: 'trending', timestamp: 530,
  });

  assert.equal(universe.length, 1, 'should emit SIMULATION_UNIVERSE on aggregated signal');
  assert.equal(universe[0]!.scenarioCount, 256, 'scenario count should always be 256');
  assert.ok(
    universe[0]!.mirrorConfidence >= 0 && universe[0]!.mirrorConfidence <= 1,
    `mirrorConfidence ${universe[0]!.mirrorConfidence} should be in [0, 1]`,
  );
}

function testSimUniverseMirrorEmitsAllFourCandidates(): void {
  const bus = new EventBus();
  const sim = new SimulationUniverseService(bus);
  sim.start();

  const mirrors: ExecutionPathMirrorEvent[] = [];
  bus.on<ExecutionPathMirrorEvent>(EVENTS.EXECUTION_PATH_MIRROR, (e) => { mirrors.push(e); });

  // Provide an execution plan so the mirror has an actual plan to compare against
  bus.emit(EVENTS.EXECUTION_PLAN, {
    executionId: 'exec-1', contractId: 'KXBTC-SIM5', direction: 'YES',
    orderStyle: 'market', slices: 1, expectedSlippage: 0.003, fillProbability: 0.95,
    limitPrice: 0.60, size: 100, latencyBudgetMs: 70, routeReason: 'test',
    safetyMode: 'normal', timestamp: 540,
  });

  bus.emit(EVENTS.AGGREGATED_SIGNAL, {
    contractId: 'KXBTC-SIM5', direction: 'YES', score: 0.70, agreement: 0.80,
    strategyWeights: {}, strategySignals: [], regime: 'trending', timestamp: 541,
  });

  assert.equal(mirrors.length, 1, 'should emit EXECUTION_PATH_MIRROR when a plan is available');
  const candidates = Object.keys(mirrors[0]!.candidateDivergences);
  assert.ok(candidates.includes('market-aggressive'), 'should have market-aggressive candidate');
  assert.ok(candidates.includes('passive-patient'), 'should have passive-patient candidate');
  assert.ok(candidates.includes('sliced-vwap'), 'should have sliced-vwap candidate');
  assert.ok(candidates.includes('reduced-half'), 'should have reduced-half candidate');
  assert.ok(mirrors[0]!.klDivergence >= 0, 'klDivergence should be non-negative');
  assert.ok(mirrors[0]!.bestCandidatePlan.length > 0, 'bestCandidatePlan should be set');
  assert.equal(mirrors[0]!.contractId, 'KXBTC-SIM5', 'contractId should match the plan');
}

// ─── Run all ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  testBeliefGraphEmitsOnMicrostructure();
  testBeliefGraphCalibrationNode();
  testBeliefGraphAllFourNodeTypes();
  testBeliefGraphConstitutionalAndConfidenceBounds();

  testGenomeNoLifecycleEventWhileInBirth();
  testGenomeGraduatesToGrowthAfterFivePasses();
  testGenomeDecayOnProlongedPoorPerformance();
  testGenomeExtinctionIsTerminal();

  testSimUniverseEmitsBothValidationsOnSignal();
  testSimUniverseWalkForwardPassOnConfidentSignal();
  testSimUniverseAdversarialPanicPenalty();
  testSimUniverseEmitsUniverseOnAggregatedSignal();
  testSimUniverseMirrorEmitsAllFourCandidates();

  process.stdout.write('slice-6-services-ok\n');
}

await run();
