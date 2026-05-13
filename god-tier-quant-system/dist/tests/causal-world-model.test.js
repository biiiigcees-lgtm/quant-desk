import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { CausalWorldModelService } from '../services/causal-world-model/service.js';
function emitMicro(bus, contractId, timestamp) {
    const event = {
        contractId,
        obi: 0.62,
        obiVelocity: 0.18,
        liquidityPressureScore: 0.54,
        spreadExpansionScore: 0.08,
        sweepProbability: 0.22,
        panicRepricing: false,
        liquidityRegime: 'normal',
        aggressionScore: 0.41,
        timestamp,
    };
    assert.equal(bus.emit(EVENTS.MICROSTRUCTURE, event), true, 'microstructure should emit');
}
function emitProbability(bus, contractId, timestamp) {
    const event = {
        contractId,
        estimatedProbability: 0.58,
        marketImpliedProbability: 0.53,
        edge: 0.05,
        confidenceInterval: [0.52, 0.64],
        uncertaintyScore: 0.21,
        calibrationError: 0.07,
        brierScore: 0.18,
        regime: 'trending',
        timestamp,
    };
    assert.equal(bus.emit(EVENTS.PROBABILITY, event), true, 'probability should emit');
}
function emitDrift(bus, contractId, timestamp) {
    const event = {
        contractId,
        psi: 0.24,
        kl: 0.3,
        severity: 'medium',
        timestamp,
    };
    assert.equal(bus.emit(EVENTS.DRIFT_EVENT, event), true, 'drift should emit');
}
function emitCalibration(bus, contractId, timestamp) {
    const event = {
        contractId,
        ece: 0.09,
        brier: 0.17,
        calibratedConfidence: 0.73,
        timestamp,
    };
    assert.equal(bus.emit(EVENTS.CALIBRATION_UPDATE, event), true, 'calibration should emit');
}
function emitAnomalyExecutionPair(bus, contractId, timestamp) {
    assert.equal(bus.emit(EVENTS.ANOMALY, {
        contractId,
        type: 'suspicious-repricing',
        severity: 'high',
        confidenceDegradation: 0.6,
        details: 'test',
        timestamp,
    }), true, 'anomaly should emit');
    const control = {
        contractId,
        mode: 'safe-mode',
        reason: 'test-guardrail',
        timestamp: timestamp + 70,
    };
    assert.equal(bus.emit(EVENTS.EXECUTION_CONTROL, control), true, 'execution control should emit');
}
function findLastMatch(items, predicate) {
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item !== undefined && predicate(item)) {
            return item;
        }
    }
    return undefined;
}
function testCausalInsightUsesDeterministicTimestamps() {
    const bus = new EventBus();
    const service = new CausalWorldModelService(bus);
    service.start();
    const insights = [];
    bus.on(EVENTS.CAUSAL_INSIGHT, (event) => {
        insights.push(event);
    });
    const contractId = 'KXBTC-CAUSAL-A';
    for (let i = 0; i < 5; i++) {
        const base = 1000 + i * 1000;
        emitMicro(bus, contractId, base);
        emitProbability(bus, contractId, base + 100);
    }
    const latest = findLastMatch(insights, (event) => event.contractId === contractId &&
        event.cause === EVENTS.MICROSTRUCTURE &&
        event.effect === EVENTS.PROBABILITY);
    assert.ok(latest, 'expected a microstructure -> probability causal insight');
    assert.ok((latest?.causalStrength ?? 0) >= 0.8, `expected strong causal strength, got ${latest?.causalStrength}`);
    assert.equal(latest?.timestamp, 5100, 'insight timestamp should be derived from event timestamps, not wall clock');
}
function testMarketCausalStateDetectsLiquidityFragility() {
    const bus = new EventBus();
    const service = new CausalWorldModelService(bus);
    service.start();
    const states = [];
    bus.on(EVENTS.MARKET_CAUSAL_STATE, (event) => {
        states.push(event);
    });
    const contractId = 'KXBTC-CAUSAL-B';
    for (let i = 0; i < 5; i++) {
        const base = 20000 + i * 1000;
        emitDrift(bus, contractId, base);
        emitCalibration(bus, contractId, base + 50);
    }
    const latest = findLastMatch(states, (event) => event.contractId === contractId);
    assert.ok(latest, 'expected a causal market state update');
    assert.equal(latest?.hiddenState, 'liquidity-fragility', 'expected drift/calibration coupling to map to liquidity fragility');
    assert.equal(latest?.topDriver?.cause, EVENTS.DRIFT_EVENT, 'top driver should be drift');
    assert.equal(latest?.topDriver?.effect, EVENTS.CALIBRATION_UPDATE, 'top driver should target calibration');
    assert.ok((latest?.confidence ?? 0) > 0.5, `expected confidence > 0.5, got ${latest?.confidence}`);
}
function testContractIsolationAcrossCausalGraphs() {
    const bus = new EventBus();
    const service = new CausalWorldModelService(bus);
    service.start();
    const contractA = 'KXBTC-CAUSAL-C';
    const contractB = 'KXBTC-CAUSAL-D';
    for (let i = 0; i < 5; i++) {
        const baseA = 30000 + i * 1000;
        emitDrift(bus, contractA, baseA);
        emitCalibration(bus, contractA, baseA + 40);
        const baseB = 60000 + i * 1000;
        emitAnomalyExecutionPair(bus, contractB, baseB);
    }
    const insights = service.getLatestInsights();
    const states = service.getAllStates();
    const contractBAnomalyEdge = insights.find((event) => event.contractId === contractB &&
        event.cause === EVENTS.ANOMALY &&
        event.effect === EVENTS.EXECUTION_CONTROL);
    const contractAAnomalyEdge = insights.find((event) => event.contractId === contractA &&
        event.cause === EVENTS.ANOMALY &&
        event.effect === EVENTS.EXECUTION_CONTROL);
    assert.ok(contractBAnomalyEdge, 'contract B should have anomaly -> execution causal edge');
    assert.equal(contractAAnomalyEdge, undefined, 'contract A should not inherit contract B anomaly edges');
    assert.ok(states.some((state) => state.contractId === contractA), 'contract A should have its own causal state');
    assert.ok(states.some((state) => state.contractId === contractB), 'contract B should have its own causal state');
}
async function run() {
    testCausalInsightUsesDeterministicTimestamps();
    testMarketCausalStateDetectsLiquidityFragility();
    testContractIsolationAcrossCausalGraphs();
    process.stdout.write('causal-world-model-ok\n');
}
await run();
