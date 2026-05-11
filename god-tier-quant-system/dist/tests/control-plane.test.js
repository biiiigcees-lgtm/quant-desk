import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ReplayEngine } from '../services/replay-engine/service.js';
import { AdaptiveRiskEngine } from '../services/adaptive-risk/service.js';
import { ExecutionIntelligenceEngine } from '../services/execution-intelligence/service.js';
import { StrategyEcology } from '../services/strategy-ecology/service.js';
import { SignalEngine } from '../services/signal-engine/service.js';
import { SimulationUniverseService } from '../services/simulation-universe/service.js';
import { OptimizationEngine } from '../services/optimization-engine/service.js';
function testOrderedHistory() {
    const bus = new EventBus();
    const replay = new ReplayEngine(bus);
    replay.start();
    bus.emit(EVENTS.MARKET_DATA, {
        contractId: 'KXBTC-ORDER',
        yesPrice: 0.51,
        noPrice: 0.49,
        spread: 0.01,
        bidLevels: [[0.5, 100]],
        askLevels: [[0.51, 100]],
        volume: 1000,
        timestamp: 1,
    });
    bus.emit(EVENTS.PROBABILITY, {
        contractId: 'KXBTC-ORDER',
        estimatedProbability: 0.53,
        marketImpliedProbability: 0.51,
        edge: 0.02,
        confidenceInterval: [0.47, 0.59],
        uncertaintyScore: 0.21,
        calibrationError: 0.02,
        brierScore: 0.11,
        regime: 'trending',
        timestamp: 2,
    });
    const records = replay.getRecords();
    assert.equal(records.length, 2, 'replay should capture tracked events');
    assert.deepEqual(records.map((record) => record.event), [EVENTS.MARKET_DATA, EVENTS.PROBABILITY], 'tracked events should preserve emit order');
    assert.deepEqual(records.map((record) => record.sequence), [1, 2], 'bus sequence numbers should be monotonic');
    assert.equal(replay.checksum(), replay.checksum(), 'checksum should remain stable for unchanged history');
}
function testHardStopRiskBlocksExecution() {
    const bus = new EventBus();
    new AdaptiveRiskEngine(bus, 10000, 0.5).start();
    new ExecutionIntelligenceEngine(bus).start();
    const controlModes = [];
    const executionStates = [];
    let decisionApproved = true;
    let decisionReason = '';
    bus.on(EVENTS.EXECUTION_CONTROL, (event) => {
        controlModes.push(event.mode);
    });
    bus.on(EVENTS.RISK_DECISION, (event) => {
        decisionApproved = event.approved;
        decisionReason = event.reason;
    });
    bus.on(EVENTS.EXECUTION_STATE, (event) => {
        executionStates.push({ phase: event.phase, reason: event.reason });
    });
    bus.emit(EVENTS.CALIBRATION_UPDATE, {
        contractId: 'KXBTC-RISK',
        ece: 0.19,
        brier: 0.24,
        calibratedConfidence: 0.61,
        timestamp: 10,
    });
    bus.emit(EVENTS.AGGREGATED_SIGNAL, {
        contractId: 'KXBTC-RISK',
        direction: 'YES',
        score: 78,
        agreement: 92,
        strategyWeights: { momentum: 1 },
        strategySignals: [],
        regime: 'trending',
        timestamp: 11,
    });
    assert.equal(controlModes.at(-1), 'hard-stop', 'critical calibration should trip hard-stop control');
    assert.equal(decisionApproved, false, 'hard-stop should reject new risk decisions');
    assert.equal(decisionReason, 'calibration-critical', 'risk should surface the hard-stop reason');
    assert.equal(executionStates.at(-1)?.phase, 'blocked', 'blocked decisions should publish a blocked execution state');
}
async function testValidationBlockingRemovesWeights() {
    const bus = new EventBus();
    const ecology = new StrategyEcology(bus);
    const simulationUniverse = new SimulationUniverseService(bus);
    const signal = new SignalEngine(bus);
    const optimization = new OptimizationEngine(bus, ecology, signal);
    ecology.start();
    simulationUniverse.start();
    optimization.start();
    signal.start();
    const aggregated = [];
    bus.on(EVENTS.AGGREGATED_SIGNAL, (event) => {
        aggregated.push({ direction: event.direction, score: event.score });
    });
    bus.emit(EVENTS.PROBABILITY, {
        contractId: 'KXBTC-VAL',
        estimatedProbability: 0.501,
        marketImpliedProbability: 0.5,
        edge: 0.001,
        confidenceInterval: [0.49, 0.51],
        uncertaintyScore: 0.49,
        calibrationError: 0.01,
        brierScore: 0.25,
        regime: 'panic',
        timestamp: 20,
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.ok(aggregated.length >= 1, 'probability input should still produce an aggregated signal');
    assert.equal(aggregated.at(-1)?.direction, 'FLAT', 'failed validation should zero strategy weights before aggregation');
    const latest = aggregated.at(-1);
    if (!latest) {
        throw new Error('expected an aggregated signal');
    }
    assert.ok(latest.score <= 0.01, 'failed validation should collapse the aggregate score');
}
async function run() {
    testOrderedHistory();
    testHardStopRiskBlocksExecution();
    await testValidationBlockingRemovesWeights();
    process.stdout.write('control-plane-ok\n');
}
await run();
