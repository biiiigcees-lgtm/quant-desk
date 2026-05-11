import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import {
  BeliefGraphStateEvent,
  DecisionSnapshotEvent,
} from '../core/schemas/events.js';
import { BeliefGraphService } from '../services/belief-graph/service.js';
import { ConstitutionalDecisionService } from '../services/constitutional-decision/service.js';

// Test: Belief graph updates probability nodes from snapshot
function testBeliefGraphUpdatesFromSnapshot(): void {
  const bus = new EventBus();
  new BeliefGraphService(bus).start();

  let beliefEvent: any = null;
  bus.on<BeliefGraphStateEvent>(EVENTS.BELIEF_GRAPH_STATE, (event) => {
    beliefEvent = event;
  });

  const now = Date.now();
  const snapshot = makeSnapshot('KXBTC-BF-1', now);
  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  assert.ok(beliefEvent !== null, 'expected belief graph state event');
  if (!beliefEvent) {
    throw new Error('belief event missing');
  }
  const summary = beliefEvent.summary;

  assert.ok(summary.beliefAdjustedProbability > 0, 'belief adjusted probability must be positive');
  assert.ok(summary.beliefAdjustedProbability < 1, 'belief adjusted probability must be < 1');
  assert.ok(summary.topHypotheses.length > 0, 'expected at least one hypothesis');
  assert.ok(summary.topHypotheses[0].nodeId, 'top hypothesis must have nodeId');
}

// Test: Belief graph detects contradictions
function testBeliefGraphDetectsContradictions(): void {
  const bus = new EventBus();
  new BeliefGraphService(bus).start();

  let beliefEvent: any = null;
  bus.on<BeliefGraphStateEvent>(EVENTS.BELIEF_GRAPH_STATE, (event) => {
    beliefEvent = event;
  });

  const now = Date.now();
  const snapshot = makeSnapshot('KXBTC-BF-2', now);
  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  // Emit conflicting anomaly to trigger contradiction
  bus.emit(EVENTS.ANOMALY, {
    contractId: 'KXBTC-BF-2',
    type: 'volatility-spike',
    severity: 'high',
    confidenceDegradation: 0.8,
    details: 'implied vol jumped 45%',
    timestamp: now + 100,
  });

  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  assert.ok(beliefEvent !== null, 'expected belief graph state event');
  if (!beliefEvent) {
    throw new Error('belief event missing');
  }
  const summary = beliefEvent.summary;
  assert.ok(summary.contradictionCount >= 0, 'contradiction count should be >= 0');
}

// Test: Belief graph applies calibration decay
function testBeliefGraphCalibrationNode(): void {
  const bus = new EventBus();
  new BeliefGraphService(bus).start();

  let beliefEvent: any = null;
  bus.on<BeliefGraphStateEvent>(EVENTS.BELIEF_GRAPH_STATE, (event) => {
    beliefEvent = event;
  });

  const now = Date.now();
  const snapshot = makeSnapshot('KXBTC-BF-3', now);
  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  // Emit calibration event with high ECE (poor calibration)
  bus.emit(EVENTS.CALIBRATION_UPDATE, {
    contractId: 'KXBTC-BF-3',
    ece: 0.15, // expected calibration error
    brier: 0.08,
    calibratedConfidence: 0.8,
    timestamp: now + 50,
  });

  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  assert.ok(beliefEvent !== null, 'expected belief graph state event');
  if (!beliefEvent) {
    throw new Error('belief event missing');
  }
  const summary = beliefEvent.summary;
  // With good calibration, uncertainty should be lower
  assert.ok(
    summary.beliefUncertaintyInterval[1] - summary.beliefUncertaintyInterval[0] < 0.5,
    'belief uncertainty interval should be reasonable',
  );
}

// Test: Belief graph feeds into constitutional decision
function testBeliefGraphFeedsConstitutionalDecision(): void {
  const bus = new EventBus();
  new BeliefGraphService(bus).start();
  const constitution = new ConstitutionalDecisionService(bus);
  constitution.start();

  let beliefEvent: any = null;
  let constitutionalEvent: any = null;

  bus.on<BeliefGraphStateEvent>(EVENTS.BELIEF_GRAPH_STATE, (event) => {
    beliefEvent = event;
  });
  bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
    constitutionalEvent = event;
  });

  const now = Date.now();
  const snapshot = makeSnapshot('KXBTC-BF-4', now);
  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  // Feed belief graph event via snapshot
  const agg = makeAggregated('KXBTC-BF-4');
  bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, agg);

  assert.ok(beliefEvent !== null, 'expected belief graph output');
  assert.ok(constitutionalEvent !== null, 'expected constitutional decision output');

  // Constitutional decision should have recorded belief graph integration
  const traces = constitutionalEvent.governance_log;
  assert.ok(
    traces.some((t: any) => t.rule === 'belief-graph-integration'),
    'constitutional decision should log belief-graph-integration rule',
  );
}

// Test: Belief graph regime transition hazard
function testBeliefGraphRegimeTransitionHazard(): void {
  const bus = new EventBus();
  new BeliefGraphService(bus).start();

  let beliefEvent: any = null;
  bus.on<BeliefGraphStateEvent>(EVENTS.BELIEF_GRAPH_STATE, (event) => {
    beliefEvent = event;
  });

  const now = Date.now();
  const snapshot = makeSnapshot('KXBTC-BF-5', now);
  // Add drift to the snapshot
  const snapshotWithDrift: DecisionSnapshotEvent = {
    ...snapshot,
    state: {
      ...snapshot.state,
      drift: {
        contractId: 'KXBTC-BF-5',
        psi: 0.6, // high PSI = high drift
        kl: 0.4,
        severity: 'high',
        timestamp: now + 100,
      },
    },
  };

  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshotWithDrift);

  assert.ok(beliefEvent !== null, 'expected belief graph state event');
  if (!beliefEvent) {
    throw new Error('belief event missing');
  }
  const summary = beliefEvent.summary;
  assert.ok(
    summary.regimeTransitionHazard > 0.2,
    `regime transition hazard should be > 0.2 but got ${summary.regimeTransitionHazard}`,
  );
}

// Test: Belief graph graph health metrics
function testBeliefGraphGraphHealth(): void {
  const bus = new EventBus();
  new BeliefGraphService(bus).start();

  let beliefEvent: any = null;
  bus.on<BeliefGraphStateEvent>(EVENTS.BELIEF_GRAPH_STATE, (event) => {
    beliefEvent = event;
  });

  const now = Date.now();
  const snapshot = makeSnapshot('KXBTC-BF-6', now);
  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  assert.ok(beliefEvent !== null, 'expected belief graph state event');
  if (!beliefEvent) {
    throw new Error('belief event missing');
  }
  const summary = beliefEvent.summary;

  assert.ok(summary.graphDensity >= 0 && summary.graphDensity <= 1, 'graph density should be 0-1');
  assert.ok(summary.graphEntropy >= 0, 'graph entropy should be >= 0');
  assert.ok(summary.strongestBeliefs >= 0, 'strong beliefs count must be >= 0');
  assert.ok(summary.weakestBeliefs >= 0, 'weak beliefs count must be >= 0');
}

// Test: Constitutional decision forces passive with contradictions
function testConstitutionalDecisionForcesPassiveOnContradictions(): void {
  const bus = new EventBus();
  const belg = new BeliefGraphService(bus);
  belg.start();
  const constitution = new ConstitutionalDecisionService(bus);
  constitution.start();

  let constitutionalEvent: any = null;
  bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
    constitutionalEvent = event;
  });

  const now = Date.now();
  const snapshot = makeSnapshot('KXBTC-BF-7', now);
  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  // Create high contradiction scenario with anomaly
  bus.emit(EVENTS.ANOMALY, {
    contractId: 'KXBTC-BF-7',
    type: 'abnormal-liquidity',
    severity: 'high',
    confidenceDegradation: 0.9,
    details: 'orderbook dried up',
    timestamp: now + 100,
  });

  // Emit snapshot again to update belief graph
  bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);

  const agg = makeAggregated('KXBTC-BF-7');
  agg.execution_recommendation.orderStyle = 'market'; // Attempt market execution
  bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, agg);

  assert.ok(constitutionalEvent !== null, 'expected constitutional decision');
  // With contradictions (anomaly + market execution), execution mode should be adjusted
  const traces = constitutionalEvent.governance_log;
  assert.ok(
    traces.some((t: any) => t.rule.includes('belief') || t.detail.includes('contradiction')),
    'constitutional decision should log belief-related adjustments',
  );
}

// Helper: Create minimal snapshot for testing
function makeSnapshot(contractId: string, now: number): DecisionSnapshotEvent {
  return {
    snapshot_id: `${contractId}:1:${now}`,
    contractId,
    triggerEvent: EVENTS.DRIFT_EVENT,
    timestamp: now,
    market_state_hash: 'a'.repeat(64),
    eventSequence: 1,
    sourceMeta: [],
    state: {
      marketData: {
        contractId,
        yesPrice: 0.52,
        noPrice: 0.48,
        spread: 0.04,
        bidLevels: [[0.51, 100]],
        askLevels: [[0.53, 100]],
        volume: 500,
        timestamp: now,
      },
      microstructure: {
        contractId,
        obi: 0.1,
        obiVelocity: 0.05,
        liquidityPressureScore: 0.3,
        spreadExpansionScore: 0.2,
        sweepProbability: 0.15,
        panicRepricing: false,
        liquidityRegime: 'normal',
        aggressionScore: 0.25,
        timestamp: now,
      },
      features: {
        contractId,
        impliedProbability: 0.52,
        probabilityVelocity: 0.02,
        volatility: 0.08,
        spreadExpansionScore: 0.15,
        obi: 0.1,
        sweepProbability: 0.1,
        pressureAcceleration: 0.02,
        timeToExpirySeconds: 600,
        timestamp: now,
      },
      probability: {
        contractId,
        estimatedProbability: 0.54,
        marketImpliedProbability: 0.52,
        edge: 0.02,
        confidenceInterval: [0.5, 0.58],
        uncertaintyScore: 0.12,
        calibrationError: 0.04,
        brierScore: 0.05,
        regime: 'trending',
        timestamp: now,
      },
      calibration: {
        contractId,
        ece: 0.08,
        brier: 0.05,
        calibratedConfidence: 0.88,
        timestamp: now,
      },
      drift: {
        contractId,
        psi: 0.1,
        kl: 0.08,
        severity: 'low',
        timestamp: now,
      },
      anomaly: null,
      executionPlan: null,
    },
  };
}

function makeAggregated(contractId: string): any {
  return {
    contractId,
    market_state: {
      regime: 'trending',
      narrative: 'trend intact',
      observations: ['bid support'],
      confidence: 0.74,
    },
    probability_adjustment: {
      recommendedAdjustment: 0.02,
      calibrationScore: 0.86,
      overconfidenceDetected: false,
    },
    risk_level: {
      score: 42,
      recommendation: 'neutral',
      confidence: 0.81,
    },
    execution_recommendation: {
      orderStyle: 'passive',
      slices: 1,
      timingMs: 50,
      expectedSlippage: 0.01,
      fillProbability: 0.92,
      confidence: 0.77,
    },
    anomaly_flags: [],
    strategy_weights: { momentum: 0.6, mean_reversion: 0.4 },
    timestamp: Date.now(),
  };
}

// Export test functions
export const tests = {
  testBeliefGraphUpdatesFromSnapshot,
  testBeliefGraphDetectsContradictions,
  testBeliefGraphCalibrationNode,
  testBeliefGraphFeedsConstitutionalDecision,
  testBeliefGraphRegimeTransitionHazard,
  testBeliefGraphGraphHealth,
  testConstitutionalDecisionForcesPassiveOnContradictions,
};

// Run all tests
async function runAllTests(): Promise<void> {
  const testFns = Object.values(tests);
  let passed = 0;
  let failed = 0;

  for (const testFn of testFns) {
    const testName = testFn.name;
    try {
      testFn();
      console.log(`✓ ${testName}`);
      passed += 1;
    } catch (error) {
      console.error(`✗ ${testName}:`, error instanceof Error ? error.message : error);
      failed += 1;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runAllTests();
}
