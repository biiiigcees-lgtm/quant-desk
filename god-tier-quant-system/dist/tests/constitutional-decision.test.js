import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ConstitutionalDecisionService } from '../services/constitutional-decision/service.js';
function testBlocksWithoutSnapshot() {
    const bus = new EventBus();
    new ConstitutionalDecisionService(bus).start();
    const decisions = [];
    bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
        decisions.push(event);
    });
    bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, makeAggregated('KXBTC-CD-1'));
    const out = decisions[0];
    if (!out) {
        throw new Error('expected constitutional decision output');
    }
    assert.equal(out.trade_allowed, false, 'missing snapshot must block trading');
    assert.equal(out.execution_mode, 'blocked', 'missing snapshot must force blocked execution mode');
    assert.ok(out.governance_log.some((row) => row.rule === 'snapshot-required' && row.outcome === 'block'), 'expected snapshot-required block trace');
}
function testHardStopVetoWins() {
    const bus = new EventBus();
    new ConstitutionalDecisionService(bus).start();
    const decisions = [];
    bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
        decisions.push(event);
    });
    const now = Date.now();
    bus.emit(EVENTS.DECISION_SNAPSHOT, makeSnapshot('KXBTC-CD-2', now));
    bus.emit(EVENTS.EXECUTION_CONTROL, {
        contractId: 'KXBTC-CD-2',
        mode: 'hard-stop',
        reason: 'risk-lock',
        timestamp: now + 1,
    });
    bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, makeAggregated('KXBTC-CD-2'));
    const out = decisions[0];
    if (!out) {
        throw new Error('expected constitutional decision output');
    }
    assert.equal(out.trade_allowed, false, 'hard-stop must veto execution');
    assert.equal(out.execution_mode, 'blocked', 'hard-stop must force blocked mode');
    assert.ok(out.governance_log.some((row) => row.rule === 'hard-risk-veto' && row.outcome === 'block'), 'expected hard-risk-veto block trace');
}
function testMetaCalibrationAuthorityDecayBlocks() {
    const bus = new EventBus();
    new ConstitutionalDecisionService(bus).start();
    const decisions = [];
    bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
        decisions.push(event);
    });
    const now = Date.now();
    const contractId = 'KXBTC-CD-3';
    bus.emit(EVENTS.DECISION_SNAPSHOT, makeSnapshot(contractId, now));
    bus.emit(EVENTS.META_CALIBRATION, {
        contractId,
        signalCalibration: 0.61,
        aiCalibration: 0.58,
        executionCalibration: 0.55,
        regimeCalibration: 0.6,
        uncertaintyCalibration: 0.49,
        compositeScore: 0.57,
        authorityDecay: 0.91,
        timestamp: now + 1,
    });
    bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, makeAggregated(contractId));
    const out = decisions[0];
    if (!out) {
        throw new Error('expected constitutional decision output');
    }
    assert.equal(out.trade_allowed, false, 'authority decay breach must block trading');
    assert.equal(out.execution_mode, 'blocked', 'authority decay breach must force blocked mode');
    assert.ok(out.governance_log.some((row) => row.rule === 'meta-calibration-authority' && row.outcome === 'block'), 'expected meta-calibration authority block trace');
}
function testScenarioInvalidationBlocks() {
    const bus = new EventBus();
    new ConstitutionalDecisionService(bus).start();
    const decisions = [];
    bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
        decisions.push(event);
    });
    const now = Date.now();
    const contractId = 'KXBTC-CD-4';
    bus.emit(EVENTS.DECISION_SNAPSHOT, makeSnapshot(contractId, now));
    bus.emit(EVENTS.SCENARIO_BRANCH_STATE, {
        contractId,
        invalidated: true,
        branchScores: { branchA: 0.22, branchB: 0.78 },
        dominantBranch: 'branchB',
        volatilityWeight: 0.86,
        timestamp: now + 1,
    });
    bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, makeAggregated(contractId));
    const out = decisions[0];
    if (!out) {
        throw new Error('expected constitutional decision output');
    }
    assert.equal(out.trade_allowed, false, 'invalidated branch at high volatility must block trading');
    assert.equal(out.execution_mode, 'blocked', 'invalidated branch must force blocked mode');
    assert.ok(out.governance_log.some((row) => row.rule === 'scenario-branch-validity' && row.outcome === 'block'), 'expected scenario branch block trace');
}
function testLatencyConfidenceDecayAdjustsConfidence() {
    const bus = new EventBus();
    new ConstitutionalDecisionService(bus).start();
    const decisions = [];
    bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
        decisions.push(event);
    });
    const contractId = 'KXBTC-CD-LAT';
    const now = Date.now();
    bus.emit(EVENTS.DECISION_SNAPSHOT, makeSnapshot(contractId, now));
    bus.emit(EVENTS.MARKET_DATA_INTEGRITY, {
        contractId,
        healthScore: 0.42,
        degraded: true,
        reasons: ['high-latency'],
        observedGapMs: 600,
        staleAgeMs: 2400,
        latencyMs: 850,
        sourceClockSkewMs: 30,
        packetGapCount: 3,
        corruptionCount: 0,
        timestamp: now + 10,
    });
    bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, makeAggregated(contractId));
    const out = decisions[0];
    if (!out) {
        throw new Error('expected constitutional decision output');
    }
    assert.ok(out.confidence_score < 0.6, `expected latency decay to reduce confidence below 0.6; got ${out.confidence_score}`);
    assert.ok(out.governance_log.some((row) => row.rule === 'latency-confidence-decay' && row.outcome === 'adjust'), 'expected latency-confidence-decay adjustment trace');
}
function makeAggregated(contractId) {
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
            orderStyle: 'market',
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
function makeSnapshot(contractId, now) {
    const snapshotId = `${contractId}:1:${now}`;
    const marketData = {
        contractId,
        yesPrice: 0.52,
        noPrice: 0.48,
        spread: 0.01,
        bidLevels: [[0.51, 100]],
        askLevels: [[0.53, 120]],
        volume: 1200,
        timestamp: now,
    };
    const microstructure = {
        contractId,
        obi: 0.12,
        obiVelocity: 0.02,
        liquidityPressureScore: 0.25,
        spreadExpansionScore: 0.1,
        sweepProbability: 0.08,
        panicRepricing: false,
        liquidityRegime: 'normal',
        aggressionScore: 0.11,
        timestamp: now,
    };
    const features = {
        contractId,
        impliedProbability: 0.5,
        probabilityVelocity: 0.01,
        volatility: 0.12,
        spreadExpansionScore: 0.1,
        obi: 0.12,
        sweepProbability: 0.08,
        pressureAcceleration: 0.01,
        timeToExpirySeconds: 700,
        timestamp: now,
    };
    const probability = {
        contractId,
        estimatedProbability: 0.54,
        marketImpliedProbability: 0.5,
        edge: 0.04,
        confidenceInterval: [0.5, 0.58],
        uncertaintyScore: 0.2,
        calibrationError: 0.04,
        brierScore: 0.11,
        regime: 'trending',
        timestamp: now,
    };
    const calibration = {
        contractId,
        ece: 0.04,
        brier: 0.11,
        calibratedConfidence: 0.8,
        timestamp: now,
    };
    const drift = {
        contractId,
        psi: 0.05,
        kl: 0.04,
        severity: 'low',
        timestamp: now,
    };
    return {
        snapshot_id: snapshotId,
        contractId,
        triggerEvent: EVENTS.DRIFT_EVENT,
        timestamp: now,
        market_state_hash: 'a'.repeat(64),
        eventSequence: 1,
        sourceMeta: [],
        state: {
            marketData,
            microstructure,
            features,
            probability,
            calibration,
            drift,
            anomaly: null,
            executionPlan: null,
        },
        canonical: {
            snapshotId,
            contractId,
            sequence: 1,
            timestamp: now,
            hash: 'a'.repeat(64),
            sourceMeta: [],
            market: marketData,
            orderbook: {
                yesPrice: marketData.yesPrice,
                noPrice: marketData.noPrice,
                spread: marketData.spread,
                bidLevels: marketData.bidLevels,
                askLevels: marketData.askLevels,
                volume: marketData.volume,
            },
            microstructure,
            indicators: features,
            ai: {
                probability,
                calibration,
                drift,
                anomaly: null,
            },
            risk: {
                executionPermission: true,
                safetyMode: 'normal',
                reason: 'test',
                riskLevel: 50,
            },
            execution: null,
            epistemic: {
                uncertaintyScore: probability.uncertaintyScore,
                calibrationError: probability.calibrationError,
                driftSeverity: drift.severity,
                anomalySeverity: 'none',
                truthScore: 0.76,
            },
            aiContext: {
                probability,
                calibration,
                drift,
                anomaly: null,
            },
            executionState: null,
            riskState: {
                executionPermission: true,
                safetyMode: 'normal',
                reason: 'test',
                riskLevel: 50,
            },
        },
    };
}
function run() {
    testBlocksWithoutSnapshot();
    testHardStopVetoWins();
    testMetaCalibrationAuthorityDecayBlocks();
    testScenarioInvalidationBlocks();
    testLatencyConfidenceDecayAdjustsConfidence();
    process.stdout.write('constitutional-decision-ok\n');
}
run();
