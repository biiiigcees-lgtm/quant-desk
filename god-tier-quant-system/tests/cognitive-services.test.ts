import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { SystemConsciousnessService } from '../services/system-consciousness/service.js';
import { EpistemicHealthService } from '../services/epistemic-health/service.js';
import { AdversarialAuditorService } from '../services/adversarial-auditor/service.js';
import { MarketMemoryService } from '../services/market-memory/service.js';
import { MultiTimescaleCognitionService } from '../services/multiscale-cognition/service.js';
import type {
  SystemConsciousnessEvent,
  EpistemicHealthEvent,
  AdversarialAuditEvent,
  MarketMemoryEvent,
  MultiTimescaleViewEvent,
  ExecutionControlEvent,
} from '../core/schemas/events.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMicro(contractId: string, obi: number, sweepProbability = 0.3, ts = Date.now()) {
  return {
    contractId, obi, obiVelocity: obi * 0.1,
    liquidityPressureScore: 0.2, spreadExpansionScore: 0.1,
    sweepProbability, panicRepricing: false,
    liquidityRegime: 'normal', aggressionScore: 0.3, timestamp: ts,
  };
}

function makeProb(contractId: string, estimatedProbability: number, edge: number, regime = 'trending', ts = Date.now()) {
  return {
    contractId, estimatedProbability,
    marketImpliedProbability: 0.5, edge,
    confidenceInterval: [estimatedProbability - 0.05, estimatedProbability + 0.05] as [number, number],
    uncertaintyScore: 0.3, calibrationError: 0.05,
    brierScore: 0.2, regime, timestamp: ts,
  };
}

function makeCalibration(contractId: string, ece: number, ts = Date.now()) {
  return { contractId, ece, brier: ece * 2, calibratedConfidence: 1 - ece, timestamp: ts };
}

function makeDrift(contractId: string, severity: 'low' | 'medium' | 'high', ts = Date.now()) {
  const kl = severity === 'high' ? 0.8 : severity === 'medium' ? 0.4 : 0.1;
  return { contractId, psi: kl * 0.5, kl, severity, timestamp: ts };
}

function makeAnomaly(contractId: string, severity: 'low' | 'medium' | 'high' | 'critical', ts = Date.now()) {
  return { contractId, type: 'test-anomaly', severity, confidenceDegradation: 0.2, details: 'test', timestamp: ts };
}

function makeRealitySnapshot(contractId: string, truthScore: number, systemState = 'nominal', ts = Date.now()) {
  return {
    contractId, systemState, actionableState: true, uncertaintyState: 'low' as const,
    executionPermission: true, canonicalSnapshotId: 'snap-1', truthScore,
    calibrationFactor: 0.9, driftFactor: 0.1, anomalyFactor: 0.9, beliefFactor: 0.8, timestamp: ts,
  };
}

// ─── Helpers: SystemConsciousnessService inputs ───────────────────────────────

function makeBeliefGraphState(
  contractId: string,
  opts: {
    contradictionCount?: number;
    maxContradictionStrength?: number;
    graphEntropy?: number;
    contradictions?: Array<{ hypothesis1: string; hypothesis2: string; conflictStrength: number; conflictReason: string }>;
  } = {},
) {
  const contradictions = opts.contradictions ?? [];
  const ts = Date.now();
  const summary = {
    contractId, snapshot_id: 'snap-sc', market_state_hash: 'abc', cycle_id: 'cy-sc',
    beliefAdjustedProbability: 0.55, beliefUncertaintyInterval: [0.5, 0.6] as [number, number],
    contradictions,
    contradictionCount: opts.contradictionCount ?? contradictions.length,
    maxContradictionStrength: opts.maxContradictionStrength ?? (contradictions[0]?.conflictStrength ?? 0),
    topHypotheses: [{ nodeId: 'n1', hypothesis: 'momentum-bullish', evidence: 0.7, uncertainty: 0.2, causalInfluence: 0.5 }],
    regimeTransitionHazard: 0.1, regimeTransitionConfidence: 0.8,
    nextPredictedRegimes: ['trending' as const],
    graphDensity: 0.4,
    graphEntropy: opts.graphEntropy ?? 0.2,
    strongestBeliefs: 1, weakestBeliefs: 0, timestamp: ts,
  };
  return { contractId, snapshot_id: 'snap-sc', market_state_hash: 'abc', cycle_id: 'cy-sc', summary, timestamp: ts };
}

function makeConstitutionalDecision(contractId: string, tradeAllowed = true, confidenceScore = 0.75) {
  return {
    cycle_id: 'cy-cd', snapshot_id: 'snap-cd', market_state_hash: 'xyz',
    contractId, trade_allowed: tradeAllowed,
    final_probability: 0.6, edge_score: 0.05, risk_level: 0.3,
    execution_mode: 'market' as const, regime_state: 'trending',
    confidence_score: confidenceScore,
    simulation_result: { passed: true, divergenceScore: 0.05, scenarioCount: 100, tailProbability: 0.02, worstCasePnl: -50, reason: 'ok' },
    governance_log: [], agent_conflicts: [],
    agent_consensus: { market_confidence: 0.8, risk_confidence: 0.7, execution_confidence: 0.75, calibration_score: 0.85 },
    timestamp: Date.now(),
  };
}

// ─── SystemConsciousnessService ───────────────────────────────────────────────

function testConsciousnessDoesNotEmitWithoutBothInputs(): void {
  const bus = new EventBus();
  const svc = new SystemConsciousnessService(bus);
  svc.start();

  const events: SystemConsciousnessEvent[] = [];
  bus.on<SystemConsciousnessEvent>(EVENTS.SYSTEM_CONSCIOUSNESS, (e) => { events.push(e); });

  // Only calibration — no BELIEF_GRAPH_STATE or CONSTITUTIONAL_DECISION
  bus.emit(EVENTS.CALIBRATION_UPDATE, makeCalibration('KXBTC-SC0', 0.05));
  assert.equal(events.length, 0, 'should not emit without BELIEF_GRAPH_STATE + CONSTITUTIONAL_DECISION');
}

function testConsciousnessEmitsWhenBothPresent(): void {
  const bus = new EventBus();
  const svc = new SystemConsciousnessService(bus);
  svc.start();

  const events: SystemConsciousnessEvent[] = [];
  bus.on<SystemConsciousnessEvent>(EVENTS.SYSTEM_CONSCIOUSNESS, (e) => { events.push(e); });

  bus.emit(EVENTS.BELIEF_GRAPH_STATE, makeBeliefGraphState('KXBTC-SC1'));
  bus.emit(EVENTS.CONSTITUTIONAL_DECISION, makeConstitutionalDecision('KXBTC-SC1'));

  assert.ok(events.length >= 1, 'should emit SYSTEM_CONSCIOUSNESS when both inputs are present');
  assert.equal(events[0]!.contractId, 'KXBTC-SC1', 'contractId should match decision contractId');
}

function testConsciousnessCriticalWhenHighStress(): void {
  const bus = new EventBus();
  const svc = new SystemConsciousnessService(bus);
  svc.start();

  const events: SystemConsciousnessEvent[] = [];
  bus.on<SystemConsciousnessEvent>(EVENTS.SYSTEM_CONSCIOUSNESS, (e) => { events.push(e); });

  // High contradiction strength + high graph entropy → high aggregateStress
  bus.emit(EVENTS.BELIEF_GRAPH_STATE, makeBeliefGraphState('KXBTC-SC3', {
    maxContradictionStrength: 0.9,
    graphEntropy: 0.85,
    contradictions: [{ hypothesis1: 'n1', hypothesis2: 'n2', conflictStrength: 0.9, conflictReason: 'mutual exclusion' }],
  }));
  // High ECE drives calibrationStress up
  bus.emit(EVENTS.CALIBRATION_UPDATE, makeCalibration('KXBTC-SC3', 0.9));
  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-SC3', 'high'));
  bus.emit(EVENTS.CONSTITUTIONAL_DECISION, makeConstitutionalDecision('KXBTC-SC3', false, 0.1));

  const last = events.at(-1)!;
  assert.ok(last, 'should have emitted at least one event');
  assert.equal(last.cognitiveStressState, 'critical',
    `expected critical but got ${last.cognitiveStressState}`);
}

function testConsciousnessStableWhenHealthy(): void {
  const bus = new EventBus();
  const svc = new SystemConsciousnessService(bus);
  svc.start();

  const events: SystemConsciousnessEvent[] = [];
  bus.on<SystemConsciousnessEvent>(EVENTS.SYSTEM_CONSCIOUSNESS, (e) => { events.push(e); });

  // Minimal stress scenario
  bus.emit(EVENTS.BELIEF_GRAPH_STATE, makeBeliefGraphState('KXBTC-SC4', {
    maxContradictionStrength: 0.05, graphEntropy: 0.05, contradictions: [],
  }));
  bus.emit(EVENTS.CALIBRATION_UPDATE, makeCalibration('KXBTC-SC4', 0.02));
  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-SC4', 'low'));
  bus.emit(EVENTS.CONSTITUTIONAL_DECISION, makeConstitutionalDecision('KXBTC-SC4', true, 0.9));

  const last = events.at(-1)!;
  assert.equal(last.cognitiveStressState, 'stable',
    `expected stable but got ${last.cognitiveStressState}`);
}

// ─── EpistemicHealthService ───────────────────────────────────────────────────

function testEpistemicGradeAWhenAllHealthy(): void {
  const bus = new EventBus();
  const svc = new EpistemicHealthService(bus);
  svc.start();

  const events: EpistemicHealthEvent[] = [];
  bus.on<EpistemicHealthEvent>(EVENTS.EPISTEMIC_HEALTH, (e) => { events.push(e); });

  // Low ECE = high calibration health
  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.CALIBRATION_UPDATE, makeCalibration('KXBTC-EH1', 0.01, i));
  }
  // No drift, no anomaly → defaults are healthy

  const last = events.at(-1)!;
  assert.ok(
    last.epistemicHealthScore >= 0.85,
    `score should be >= 0.85 for grade A; got ${last.epistemicHealthScore}`,
  );
  assert.equal(last.healthGrade, 'A', `grade should be A; got ${last.healthGrade}`);
}

function testEpistemicGradeFWhenCriticalConditions(): void {
  const bus = new EventBus();
  const svc = new EpistemicHealthService(bus);
  svc.start();

  const events: EpistemicHealthEvent[] = [];
  bus.on<EpistemicHealthEvent>(EVENTS.EPISTEMIC_HEALTH, (e) => { events.push(e); });

  // Very high ECE → worst calibration health (ECE=0.25 → calibrationHealth = max(0, 1 - 0.25*5) = -0.25 → 0)
  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.CALIBRATION_UPDATE, makeCalibration('KXBTC-EH2', 0.25, i));
  }
  // Critical anomaly → anomalyHealth = 0
  bus.emit(EVENTS.ANOMALY, makeAnomaly('KXBTC-EH2', 'critical'));
  // High drift
  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-EH2', 'high'));

  const last = events.at(-1)!;
  assert.ok(
    last.epistemicHealthScore < 0.30,
    `score should be < 0.30 for grade F; got ${last.epistemicHealthScore}`,
  );
  assert.equal(last.healthGrade, 'F', `grade should be F; got ${last.healthGrade}`);
}

function testEpistemicHealthEmitsExecutionControlOnScoreBelow040(): void {
  const bus = new EventBus();
  const svc = new EpistemicHealthService(bus);
  svc.start();

  const controls: ExecutionControlEvent[] = [];
  bus.on<ExecutionControlEvent>(EVENTS.EXECUTION_CONTROL, (e) => { controls.push(e); });

  // Drive score below 0.40: ECE=0.25 → calibrationHealth=0; critical anomaly → anomalyHealth=0; high drift → driftHealth=0.3
  // score = 0*0.35 + 0.3*0.25 + 0*0.25 + 1*0.15 = 0.075 + 0.15 = 0.225 → < 0.40
  for (let i = 0; i < 3; i++) {
    bus.emit(EVENTS.CALIBRATION_UPDATE, makeCalibration('KXBTC-EH3', 0.25, i));
  }
  bus.emit(EVENTS.ANOMALY, makeAnomaly('KXBTC-EH3', 'critical'));
  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-EH3', 'high'));

  assert.ok(controls.length >= 1, 'should emit EXECUTION_CONTROL when epistemic score drops below 0.40');
  assert.equal(controls[0]!.mode, 'safe-mode', 'mode should be safe-mode');
  assert.ok(controls[0]!.reason.includes('epistemic-health-degraded'), 'reason should mention epistemic-health-degraded');
}

function testEpistemicHealthNoRepeatSafeModeEmission(): void {
  const bus = new EventBus();
  const svc = new EpistemicHealthService(bus);
  svc.start();

  const controls: ExecutionControlEvent[] = [];
  bus.on<ExecutionControlEvent>(EVENTS.EXECUTION_CONTROL, (e) => { controls.push(e); });

  // Push score below 0.40: ECE=0.25 → calibrationHealth=0, critical anomaly → anomalyHealth=0, high drift → driftHealth=0.3
  // score = 0*0.35 + 0.3*0.25 + 0*0.25 + 1*0.15 = 0.225 → triggers safe-mode once
  for (let i = 0; i < 3; i++) {
    bus.emit(EVENTS.CALIBRATION_UPDATE, makeCalibration('KXBTC-EH4', 0.25, i));
  }
  bus.emit(EVENTS.ANOMALY, makeAnomaly('KXBTC-EH4', 'critical'));
  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-EH4', 'high'));

  const countAfterFirst = controls.length;
  assert.equal(countAfterFirst, 1, `should emit EXECUTION_CONTROL once on first breach; got ${countAfterFirst}`);

  // Additional calibration events while still degraded should NOT re-emit safe-mode
  for (let i = 3; i < 10; i++) {
    bus.emit(EVENTS.CALIBRATION_UPDATE, makeCalibration('KXBTC-EH4', 0.25, i));
  }

  assert.equal(controls.length, 1, `should emit EXECUTION_CONTROL exactly once total; got ${controls.length}`);
}

// ─── AdversarialAuditorService ────────────────────────────────────────────────

function testAdversarialScorePositiveWithPoorCalibration(): void {
  const bus = new EventBus();
  const svc = new AdversarialAuditorService(bus);
  svc.start();

  const audits: AdversarialAuditEvent[] = [];
  bus.on<AdversarialAuditEvent>(EVENTS.ADVERSARIAL_AUDIT, (e) => { audits.push(e); });

  // Set calibrationError = 0.20 (> 0.15 threshold) and edge = 0.05 (> 0.03)
  bus.emit(EVENTS.PROBABILITY, {
    ...makeProb('KXBTC-AA1', 0.6, 0.05, 'choppy'),
    calibrationError: 0.20,
  });

  // Trigger audit
  bus.emit(EVENTS.EXECUTION_PLAN, {
    executionId: 'exec-aa1', contractId: 'KXBTC-AA1',
    direction: 'YES', orderStyle: 'market', slices: 1,
    expectedSlippage: 0.003, fillProbability: 0.9,
    limitPrice: 0.6, size: 100, latencyBudgetMs: 70,
    routeReason: 'test', safetyMode: 'normal', timestamp: Date.now(),
  });

  assert.equal(audits.length, 1, 'should emit one adversarial audit');
  assert.ok(audits[0]!.adversarialScore > 0, `adversarialScore should be > 0; got ${audits[0]!.adversarialScore}`);
  assert.ok(audits[0]!.counterNarrative.length > 0, 'counterNarrative should not be empty');
}

function testAdversarialHiddenRegimeRiskForChoppy(): void {
  const bus = new EventBus();
  const svc = new AdversarialAuditorService(bus);
  svc.start();

  const audits: AdversarialAuditEvent[] = [];
  bus.on<AdversarialAuditEvent>(EVENTS.ADVERSARIAL_AUDIT, (e) => { audits.push(e); });

  bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-AA2', 0.5, 0.01, 'choppy'));

  bus.emit(EVENTS.EXECUTION_PLAN, {
    executionId: 'exec-aa2', contractId: 'KXBTC-AA2',
    direction: 'YES', orderStyle: 'market', slices: 1,
    expectedSlippage: 0.002, fillProbability: 0.85,
    limitPrice: 0.5, size: 100, latencyBudgetMs: 70,
    routeReason: 'test', safetyMode: 'normal', timestamp: Date.now(),
  });

  assert.equal(audits[0]!.hiddenRegimeRisk, true, 'choppy regime should set hiddenRegimeRisk=true');
}

function testAdversarialHiddenRegimeRiskForLowLiquidity(): void {
  const bus = new EventBus();
  const svc = new AdversarialAuditorService(bus);
  svc.start();

  const audits: AdversarialAuditEvent[] = [];
  bus.on<AdversarialAuditEvent>(EVENTS.ADVERSARIAL_AUDIT, (e) => { audits.push(e); });

  bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-AA3', 0.5, 0.01, 'low-liquidity'));

  bus.emit(EVENTS.EXECUTION_PLAN, {
    executionId: 'exec-aa3', contractId: 'KXBTC-AA3',
    direction: 'YES', orderStyle: 'market', slices: 1,
    expectedSlippage: 0.002, fillProbability: 0.85,
    limitPrice: 0.5, size: 100, latencyBudgetMs: 70,
    routeReason: 'test', safetyMode: 'normal', timestamp: Date.now(),
  });

  assert.equal(audits[0]!.hiddenRegimeRisk, true, 'low-liquidity regime should set hiddenRegimeRisk=true');
}

function testAdversarialScoreZeroForNominalCleanState(): void {
  const bus = new EventBus();
  const svc = new AdversarialAuditorService(bus);
  svc.start();

  const audits: AdversarialAuditEvent[] = [];
  bus.on<AdversarialAuditEvent>(EVENTS.ADVERSARIAL_AUDIT, (e) => { audits.push(e); });

  // Clean: trending regime, good calibration, signal = YES matching edge > 0, nominal state
  bus.emit(EVENTS.PROBABILITY, { ...makeProb('KXBTC-AA4', 0.6, 0.01, 'trending'), calibrationError: 0.05 });
  bus.emit(EVENTS.AGGREGATED_SIGNAL, {
    contractId: 'KXBTC-AA4', direction: 'YES', score: 0.7,
    agreement: 0.8, strategyWeights: {}, strategySignals: [],
    regime: 'trending', timestamp: Date.now(),
  });
  bus.emit(EVENTS.BELIEF_GRAPH_UPDATE, {
    contractId: 'KXBTC-AA4', nodes: [], edges: [],
    constitutionalAdjustment: 0.01, graphConfidence: 0.8, timestamp: Date.now(),
  });
  bus.emit(EVENTS.REALITY_SNAPSHOT, makeRealitySnapshot('KXBTC-AA4', 0.8, 'nominal'));

  bus.emit(EVENTS.EXECUTION_PLAN, {
    executionId: 'exec-aa4', contractId: 'KXBTC-AA4',
    direction: 'YES', orderStyle: 'market', slices: 1,
    expectedSlippage: 0.002, fillProbability: 0.9,
    limitPrice: 0.6, size: 100, latencyBudgetMs: 70,
    routeReason: 'test', safetyMode: 'normal', timestamp: Date.now(),
  });

  assert.ok(audits.length >= 1, 'should emit adversarial audit');
  assert.equal(audits[0]!.adversarialScore, 0, `clean state should score 0; got ${audits[0]!.adversarialScore}`);
}

// ─── MarketMemoryService ──────────────────────────────────────────────────────

function testMarketMemoryDepthIncrementsOnMicrostructure(): void {
  const bus = new EventBus();
  const svc = new MarketMemoryService(bus);
  svc.start();

  const events: MarketMemoryEvent[] = [];
  bus.on<MarketMemoryEvent>(EVENTS.MARKET_MEMORY, (e) => { events.push(e); });

  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('KXBTC-MM1', 0.3, 0.2, i));
  }

  assert.equal(events.length, 5, 'should emit one MARKET_MEMORY per microstructure event');
  assert.equal(events.at(-1)!.memoryDepth, 5, 'memoryDepth should equal number of microstructure events');
}

function testMarketMemoryRecurrenceScorePositiveAfterSimilarFingerprints(): void {
  const bus = new EventBus();
  const svc = new MarketMemoryService(bus);
  svc.start();

  const events: MarketMemoryEvent[] = [];
  bus.on<MarketMemoryEvent>(EVENTS.MARKET_MEMORY, (e) => { events.push(e); });

  // Emit 10 very similar microstructure events (same drift → driftCode 0)
  for (let i = 0; i < 12; i++) {
    bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('KXBTC-MM2', 0.4, 0.3, i));
  }

  const last = events.at(-1)!;
  assert.ok(last.recurrenceScore > 0, `recurrenceScore should be > 0 after similar fingerprints; got ${last.recurrenceScore}`);
}

function testMarketMemoryRegimeSignatureContainsFields(): void {
  const bus = new EventBus();
  const svc = new MarketMemoryService(bus);
  svc.start();

  const events: MarketMemoryEvent[] = [];
  bus.on<MarketMemoryEvent>(EVENTS.MARKET_MEMORY, (e) => { events.push(e); });

  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-MM3', 'high'));
  bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('KXBTC-MM3', 0.7, 0.8));

  const last = events.at(-1)!;
  assert.ok(last.regimeSignature.includes('obi:'), 'regimeSignature should contain obi label');
  assert.ok(last.regimeSignature.includes('drift:'), 'regimeSignature should contain drift label');
  assert.ok(last.regimeSignature.includes('sweep:'), 'regimeSignature should contain sweep label');
}

// ─── MultiTimescaleCognitionService ──────────────────────────────────────────

function testMultiTimescaleCoherenceOneWhenAllAgree(): void {
  const bus = new EventBus();
  const svc = new MultiTimescaleCognitionService(bus);
  svc.start();

  const events: MultiTimescaleViewEvent[] = [];
  bus.on<MultiTimescaleViewEvent>(EVENTS.MULTI_TIMESCALE_VIEW, (e) => { events.push(e); });

  // Tick: bullish via high positive OBI (threshold 0.1)
  for (let i = 0; i < 10; i++) {
    bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('KXBTC-MT1', 0.5, 0.3, i));
  }

  // Local: bullish via rising probability
  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-MT1', 0.45 + i * 0.03, 0.02, 'trending', 100 + i));
  }

  // Regime: bullish via low drift severity
  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-MT1', 'low'));

  // Macro: risk-on = bullish
  bus.emit(EVENTS.GLOBAL_CONTEXT, {
    marketRegime: 'risk-on', stressIndex: 0.1, vix: 15, btcDominance: 0.45,
    macroNarrative: 'bull market', timestamp: Date.now(),
  });

  const last = events.at(-1)!;
  assert.ok(last.coherenceScore >= 0.75, `coherenceScore should be >= 0.75 when all agree; got ${last.coherenceScore}`);
  assert.equal(last.temporalAlignment, 'aligned', `temporalAlignment should be aligned; got ${last.temporalAlignment}`);
}

function testMultiTimescaleCoherenceLowWhenOnlyOneAgrees(): void {
  const bus = new EventBus();
  const svc = new MultiTimescaleCognitionService(bus);
  svc.start();

  const events: MultiTimescaleViewEvent[] = [];
  bus.on<MultiTimescaleViewEvent>(EVENTS.MULTI_TIMESCALE_VIEW, (e) => { events.push(e); });

  // Tick: bearish (negative OBI)
  for (let i = 0; i < 10; i++) {
    bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('KXBTC-MT2', -0.5, 0.3, i));
  }

  // Local: neutral/flat (tiny delta)
  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-MT2', 0.5, 0.001, 'choppy', 100 + i));
  }

  // Regime: high drift → bearish
  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-MT2', 'high'));

  // Macro: risk-on → bullish (1 scale disagrees)
  bus.emit(EVENTS.GLOBAL_CONTEXT, {
    marketRegime: 'risk-on', stressIndex: 0.2, vix: 14, btcDominance: 0.44,
    macroNarrative: 'test', timestamp: Date.now(),
  });

  const last = events.at(-1)!;
  // coherenceScore = max(down_count, up_count) / 4 — at most 3/4 = 0.75
  assert.ok(last.coherenceScore <= 0.75, `coherenceScore should be <= 0.75; got ${last.coherenceScore}`);
}

function testMultiTimescaleTemporalAlignmentMapping(): void {
  const bus = new EventBus();
  const svc = new MultiTimescaleCognitionService(bus);
  svc.start();

  const events: MultiTimescaleViewEvent[] = [];
  bus.on<MultiTimescaleViewEvent>(EVENTS.MULTI_TIMESCALE_VIEW, (e) => { events.push(e); });

  // Produce a mixed scenario: 2 bullish (tick, local), 1 bearish (regime), 1 neutral (macro)
  for (let i = 0; i < 10; i++) {
    bus.emit(EVENTS.MICROSTRUCTURE, makeMicro('KXBTC-MT3', 0.4, 0.2, i));
  }
  for (let i = 0; i < 5; i++) {
    bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-MT3', 0.45 + i * 0.02, 0.01, 'trending', 100 + i));
  }
  bus.emit(EVENTS.DRIFT_EVENT, makeDrift('KXBTC-MT3', 'high'));
  bus.emit(EVENTS.GLOBAL_CONTEXT, {
    marketRegime: 'neutral', stressIndex: 0.5, vix: 20, btcDominance: 0.43,
    macroNarrative: 'neutral', timestamp: Date.now(),
  });

  const last = events.at(-1)!;
  const validAlignments = ['aligned', 'mixed', 'divergent'];
  assert.ok(validAlignments.includes(last.temporalAlignment),
    `temporalAlignment should be one of ${validAlignments.join(',')}; got ${last.temporalAlignment}`);
}

// ─── Run all ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  testConsciousnessDoesNotEmitWithoutBothInputs();
  testConsciousnessEmitsWhenBothPresent();
  testConsciousnessCriticalWhenHighStress();
  testConsciousnessStableWhenHealthy();

  testEpistemicGradeAWhenAllHealthy();
  testEpistemicGradeFWhenCriticalConditions();
  testEpistemicHealthEmitsExecutionControlOnScoreBelow040();
  testEpistemicHealthNoRepeatSafeModeEmission();

  testAdversarialScorePositiveWithPoorCalibration();
  testAdversarialHiddenRegimeRiskForChoppy();
  testAdversarialHiddenRegimeRiskForLowLiquidity();
  testAdversarialScoreZeroForNominalCleanState();

  testMarketMemoryDepthIncrementsOnMicrostructure();
  testMarketMemoryRecurrenceScorePositiveAfterSimilarFingerprints();
  testMarketMemoryRegimeSignatureContainsFields();

  testMultiTimescaleCoherenceOneWhenAllAgree();
  testMultiTimescaleCoherenceLowWhenOnlyOneAgrees();
  testMultiTimescaleTemporalAlignmentMapping();

  process.stdout.write('cognitive-services-ok\n');
}

await run();
