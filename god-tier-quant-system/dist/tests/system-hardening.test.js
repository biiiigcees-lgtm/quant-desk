import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { LogicalClock } from '../core/clock/clock.js';
import { RiskGovernor } from '../core/risk/governor.js';
import { MemoryLifecycleManager } from '../core/memory/lifecycle.js';
import { EventLineageTracer } from '../core/observability/lineage.js';
// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeEpistemicHealth(contractId, score) {
    const grade = score >= 0.85 ? 'A' : score >= 0.70 ? 'B' : score >= 0.50 ? 'C' : score >= 0.30 ? 'D' : 'F';
    const status = score >= 0.70 ? 'stable' : score >= 0.40 ? 'degraded' : 'critical';
    return {
        contractId, score, status,
        components: { contradiction: 0, calibration: 0, drift: 0, anomaly: 0 },
        epistemicHealthScore: score,
        calibrationHealth: score,
        driftHealth: score,
        anomalyHealth: score,
        stabilityHealth: score,
        healthGrade: grade,
        timestamp: Date.now(),
    };
}
function makeAnomaly(contractId, severity) {
    return {
        contractId, type: 'test', severity,
        confidenceDegradation: 0.2, details: 'test', timestamp: Date.now(),
    };
}
function makeExecutionControl(mode, reason = 'test') {
    return { mode, reason, timestamp: Date.now() };
}
function makeProb(contractId, ts = Date.now()) {
    return {
        contractId, estimatedProbability: 0.55,
        marketImpliedProbability: 0.5, edge: 0.05,
        confidenceInterval: [0.5, 0.6],
        uncertaintyScore: 0.3, calibrationError: 0.05,
        brierScore: 0.2, regime: 'trending', timestamp: ts,
    };
}
function makeExecutionPlan(contractId, executionId = 'exec-1') {
    return {
        executionId, contractId, direction: 'YES',
        orderStyle: 'market', slices: 1,
        expectedSlippage: 0.003, fillProbability: 0.9,
        limitPrice: 0.55, size: 100, latencyBudgetMs: 70,
        routeReason: 'test', safetyMode: 'normal', timestamp: Date.now(),
    };
}
// ─── LogicalClock ─────────────────────────────────────────────────────────────
function testClockGlobalTickMonotonic() {
    const clock = new LogicalClock();
    const t1 = clock.tick();
    const t2 = clock.tick();
    const t3 = clock.tick();
    assert.ok(t1.logicalTick < t2.logicalTick, 'global ticks must be monotonically increasing');
    assert.ok(t2.logicalTick < t3.logicalTick, 'global ticks must be monotonically increasing');
    assert.equal(clock.globalCurrent(), 3, 'globalCurrent should equal number of ticks');
}
function testClockPerContractIndependence() {
    const clock = new LogicalClock();
    clock.tick('A');
    clock.tick('A');
    clock.tick('B');
    assert.equal(clock.current('A'), 2, 'contract A should have tick 2');
    assert.equal(clock.current('B'), 1, 'contract B should have tick 1');
    assert.equal(clock.current('C'), 0, 'unknown contract should have tick 0');
}
function testClockSnapshotIdUnique() {
    const clock = new LogicalClock();
    const ids = new Set();
    for (let i = 0; i < 20; i++) {
        ids.add(clock.snapshotId('KXBTC-CK1'));
    }
    assert.equal(ids.size, 20, 'each snapshotId must be unique');
}
function testClockReset() {
    const clock = new LogicalClock();
    clock.tick('A');
    clock.tick('A');
    clock.reset();
    assert.equal(clock.globalCurrent(), 0, 'globalCurrent should be 0 after reset');
    assert.equal(clock.current('A'), 0, 'contract tick should be 0 after reset');
}
// ─── RiskGovernor ─────────────────────────────────────────────────────────────
function testGovernorStartsNormal() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    assert.equal(gov.getMode(), 'NORMAL', 'governor should start in NORMAL mode');
    assert.ok(gov.canExecute(), 'canExecute should be true in NORMAL');
}
function testGovernorDegradedOnWeakEpistemic() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    const modes = [];
    bus.on(EVENTS.RISK_GOVERNANCE, (e) => { modes.push(e.mode); });
    bus.emit(EVENTS.EPISTEMIC_HEALTH, makeEpistemicHealth('KXBTC-RG1', 0.55));
    assert.equal(gov.getMode(), 'DEGRADED', `should be DEGRADED at score 0.55; got ${gov.getMode()}`);
    assert.ok(gov.canExecute(), 'DEGRADED still allows execution');
    assert.ok(modes.includes('DEGRADED'), 'should emit RISK_GOVERNANCE event for DEGRADED');
}
function testGovernorSafeOnLowEpistemic() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    bus.emit(EVENTS.EPISTEMIC_HEALTH, makeEpistemicHealth('KXBTC-RG2', 0.30));
    assert.equal(gov.getMode(), 'SAFE', `should be SAFE at score 0.30; got ${gov.getMode()}`);
    assert.ok(!gov.canExecute(), 'SAFE mode must block execution');
}
function testGovernorLockedOnCriticalEpistemic() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    bus.emit(EVENTS.EPISTEMIC_HEALTH, makeEpistemicHealth('KXBTC-RG3', 0.15));
    assert.equal(gov.getMode(), 'LOCKED', `should be LOCKED at score 0.15; got ${gov.getMode()}`);
    assert.ok(!gov.canExecute(), 'LOCKED mode must block execution');
    assert.ok(gov.isLocked(), 'isLocked() should return true');
    assert.ok(gov.lockedSince() !== null, 'lockedSince should be set');
}
function testGovernorLockedIsSticky() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    // First lock it
    bus.emit(EVENTS.EPISTEMIC_HEALTH, makeEpistemicHealth('KXBTC-RG4', 0.10));
    assert.equal(gov.getMode(), 'LOCKED');
    // Now send a healthy epistemic health — LOCKED must not release automatically
    bus.emit(EVENTS.EPISTEMIC_HEALTH, makeEpistemicHealth('KXBTC-RG4', 0.95));
    assert.equal(gov.getMode(), 'LOCKED', 'LOCKED mode must be sticky — only manual intervention can clear it');
}
function testGovernorSafeOnExecutionControlSafeMode() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    bus.emit(EVENTS.EXECUTION_CONTROL, makeExecutionControl('safe-mode'));
    assert.equal(gov.getMode(), 'SAFE', 'execution-control safe-mode should set governor to SAFE');
}
function testGovernorLockedOnHardStop() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    bus.emit(EVENTS.EXECUTION_CONTROL, makeExecutionControl('hard-stop'));
    assert.equal(gov.getMode(), 'LOCKED', 'hard-stop should set governor to LOCKED');
}
function testGovernorDegradedOnCriticalAnomaly() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    bus.emit(EVENTS.ANOMALY, makeAnomaly('KXBTC-RG5', 'critical'));
    assert.equal(gov.getMode(), 'DEGRADED', 'critical anomaly should set governor to DEGRADED');
}
function testGovernorPriorityHigherModeWins() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    // Set DEGRADED via anomaly, then SAFE via epistemic
    bus.emit(EVENTS.ANOMALY, makeAnomaly('KXBTC-RG6', 'critical'));
    assert.equal(gov.getMode(), 'DEGRADED');
    bus.emit(EVENTS.EPISTEMIC_HEALTH, makeEpistemicHealth('KXBTC-RG6', 0.30));
    assert.equal(gov.getMode(), 'SAFE', 'SAFE should win over DEGRADED by priority');
}
function testGovernorSubscriberNotified() {
    const bus = new EventBus();
    const gov = new RiskGovernor(bus);
    gov.start();
    const notifications = [];
    gov.subscribe((mode) => { notifications.push(mode); });
    bus.emit(EVENTS.EPISTEMIC_HEALTH, makeEpistemicHealth('KXBTC-RG7', 0.55));
    bus.emit(EVENTS.EPISTEMIC_HEALTH, makeEpistemicHealth('KXBTC-RG7', 0.30));
    assert.ok(notifications.includes('DEGRADED'), 'subscriber should receive DEGRADED notification');
    assert.ok(notifications.includes('SAFE'), 'subscriber should receive SAFE notification');
}
// ─── MemoryLifecycleManager ───────────────────────────────────────────────────
function testMemoryLifecyclePruneCallsRegistrations() {
    const mgr = new MemoryLifecycleManager();
    let called = 0;
    mgr.register('test-pruner', () => { called++; });
    mgr.prune();
    mgr.prune();
    assert.equal(called, 2, 'prune() should call each registered pruner');
    assert.equal(mgr.stats().pruneCount, 2, 'pruneCount should be 2');
}
function testMemoryLifecycleUnregister() {
    const mgr = new MemoryLifecycleManager();
    let called = 0;
    const unsub = mgr.register('test', () => { called++; });
    mgr.prune();
    unsub();
    mgr.prune();
    assert.equal(called, 1, 'after unsubscribe, pruner should not be called again');
}
function testMemoryLifecycleErrorInPrunerDoesNotCrash() {
    const mgr = new MemoryLifecycleManager();
    mgr.register('throws', () => { throw new Error('prune-error'); });
    mgr.register('good', () => { });
    assert.doesNotThrow(() => mgr.prune(), 'prune errors must be swallowed');
}
function testMemoryLifecycleStartStopIdempotent() {
    const mgr = new MemoryLifecycleManager();
    mgr.start(1000);
    mgr.start(1000); // second call is no-op
    mgr.stop();
    mgr.stop(); // second stop is no-op
    assert.equal(mgr.stats().registrations, 0, 'no registrations should remain');
}
// ─── EventLineageTracer ───────────────────────────────────────────────────────
function testLineageTracerOpenChainOnProbability() {
    const bus = new EventBus();
    const tracer = new EventLineageTracer(bus);
    tracer.start();
    bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-LT1'));
    const chains = tracer.getLineage('KXBTC-LT1', 10);
    assert.ok(chains.length >= 1, 'should have at least one chain after PROBABILITY event');
    assert.equal(chains[0].contractId, 'KXBTC-LT1');
}
function testLineageTracerRecordsAgentResponses() {
    const bus = new EventBus();
    const tracer = new EventLineageTracer(bus);
    tracer.start();
    bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-LT2'));
    bus.emit(EVENTS.AI_AGENT_RESPONSE, {
        requestId: 'req-1',
        agent: 'market-analyst',
        contractId: 'KXBTC-LT2',
        triggerEvent: EVENTS.PROBABILITY,
        snapshot_id: 'snap-test',
        market_state_hash: 'abc',
        output: { bias: 'LONG', confidence: 0.75, uncertainty: 0.2, riskLevel: 0.3, reasoning: 'test', invalidation: 'none', executionRecommendation: 'EXECUTE' },
        metrics: { latencyMs: 150, model: 'test', fallbackDepth: 0, cacheHit: false },
        timestamp: Date.now(),
    });
    const chain = tracer.getLineage('KXBTC-LT2', 5).at(-1);
    assert.ok(chain.aiAgents.length >= 1, 'should record agent responses');
    assert.equal(chain.aiAgents[0].agent, 'market-analyst');
    assert.ok(chain.aiAgents[0].confidence > 0, 'confidence should be recorded');
}
function testLineageTracerRecordsExecutionDecision() {
    const bus = new EventBus();
    const tracer = new EventLineageTracer(bus);
    tracer.start();
    bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-LT3'));
    bus.emit(EVENTS.EXECUTION_PLAN, makeExecutionPlan('KXBTC-LT3', 'exec-lt3'));
    const chain = tracer.getLineage('KXBTC-LT3', 5).at(-1);
    assert.ok(chain.executionDecision !== undefined, 'should record execution decision');
    assert.equal(chain.executionDecision.executionId, 'exec-lt3');
    assert.equal(chain.executionDecision.direction, 'YES');
}
function testLineageTracerBoundedAtMaxChains() {
    const bus = new EventBus();
    const tracer = new EventLineageTracer(bus, 10); // small max for test
    tracer.start();
    // Open 15 chains
    for (let i = 0; i < 15; i++) {
        bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-LT4', i));
    }
    const recent = tracer.getRecent(100);
    assert.ok(recent.length <= 10, `chains should be bounded at maxChains=10; got ${recent.length}`);
}
function testLineageTracerPruneOlderThan() {
    const bus = new EventBus();
    const tracer = new EventLineageTracer(bus);
    tracer.start();
    // Emit some events at a fake old timestamp (1ms epoch — must be > 0 to pass bus validation)
    bus.emit(EVENTS.PROBABILITY, { ...makeProb('KXBTC-LT5'), timestamp: 1 });
    bus.emit(EVENTS.PROBABILITY, makeProb('KXBTC-LT5')); // current time
    const beforePrune = tracer.getRecent(100).length;
    tracer.pruneOlderThan(60 * 1000); // prune older than 1 minute
    const afterPrune = tracer.getRecent(100).length;
    assert.ok(afterPrune < beforePrune, 'pruneOlderThan should remove old chains');
}
// ─── Run all ──────────────────────────────────────────────────────────────────
async function run() {
    testClockGlobalTickMonotonic();
    testClockPerContractIndependence();
    testClockSnapshotIdUnique();
    testClockReset();
    testGovernorStartsNormal();
    testGovernorDegradedOnWeakEpistemic();
    testGovernorSafeOnLowEpistemic();
    testGovernorLockedOnCriticalEpistemic();
    testGovernorLockedIsSticky();
    testGovernorSafeOnExecutionControlSafeMode();
    testGovernorLockedOnHardStop();
    testGovernorDegradedOnCriticalAnomaly();
    testGovernorPriorityHigherModeWins();
    testGovernorSubscriberNotified();
    testMemoryLifecyclePruneCallsRegistrations();
    testMemoryLifecycleUnregister();
    testMemoryLifecycleErrorInPrunerDoesNotCrash();
    testMemoryLifecycleStartStopIdempotent();
    testLineageTracerOpenChainOnProbability();
    testLineageTracerRecordsAgentResponses();
    testLineageTracerRecordsExecutionDecision();
    testLineageTracerBoundedAtMaxChains();
    testLineageTracerPruneOlderThan();
    process.stdout.write('system-hardening-ok\n');
}
await run();
