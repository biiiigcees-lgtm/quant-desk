import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ExecutionIntelligenceEngine } from '../services/execution-intelligence/service.js';
import { SimulationEngine } from '../services/simulation-engine/service.js';
async function testConstitutionalDecisionDrivesExecutionLifecycle() {
    const bus = new EventBus();
    new ExecutionIntelligenceEngine(bus).start();
    new SimulationEngine(bus).start();
    const phases = [];
    bus.on(EVENTS.EXECUTION_STATE, (event) => {
        phases.push(event.phase);
    });
    bus.emit(EVENTS.CONSTITUTIONAL_DECISION, {
        cycle_id: 'cycle-1',
        snapshot_id: 'snap-1',
        market_state_hash: 'a'.repeat(64),
        contractId: 'KXBTC-LC',
        trade_allowed: true,
        final_probability: 0.62,
        edge_score: 0.08,
        risk_level: 40,
        execution_mode: 'market',
        regime_state: 'trending',
        confidence_score: 0.81,
        simulation_result: {
            passed: true,
            divergenceScore: 0.12,
            scenarioCount: 256,
            tailProbability: 0.12,
            worstCasePnl: -15,
            reason: 'ok',
        },
        governance_log: [],
        agent_conflicts: [],
        agent_consensus: {
            market_confidence: 0.8,
            risk_confidence: 0.8,
            execution_confidence: 0.8,
            calibration_score: 0.8,
        },
        timestamp: Date.now(),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(phases[0], 'created', 'first phase should be created');
    assert.equal(phases[1], 'submitted', 'second phase should be submitted');
    assert.ok(phases.includes('acknowledged'), 'lifecycle should include acknowledged phase');
    assert.ok(phases.some((p) => p === 'filled' || p === 'partially_filled' || p === 'rejected' || p === 'expired'));
}
function testBlockedConstitutionalDecisionDoesNotEmitPlan() {
    const bus = new EventBus();
    new ExecutionIntelligenceEngine(bus).start();
    let plans = 0;
    let blocked = 0;
    bus.on(EVENTS.EXECUTION_PLAN, () => {
        plans += 1;
    });
    bus.on(EVENTS.EXECUTION_STATE, (event) => {
        if (event.phase === 'blocked') {
            blocked += 1;
        }
    });
    bus.emit(EVENTS.CONSTITUTIONAL_DECISION, {
        cycle_id: 'cycle-2',
        snapshot_id: 'snap-2',
        market_state_hash: 'b'.repeat(64),
        contractId: 'KXBTC-LC',
        trade_allowed: false,
        final_probability: 0.53,
        edge_score: 0.02,
        risk_level: 93,
        execution_mode: 'blocked',
        regime_state: 'panic',
        confidence_score: 0.4,
        simulation_result: {
            passed: false,
            divergenceScore: 0.82,
            scenarioCount: 256,
            tailProbability: 0.5,
            worstCasePnl: -220,
            reason: 'veto',
        },
        governance_log: [],
        agent_conflicts: [],
        agent_consensus: {
            market_confidence: 0.4,
            risk_confidence: 0.9,
            execution_confidence: 0.3,
            calibration_score: 0.5,
        },
        timestamp: Date.now(),
    });
    assert.equal(plans, 0, 'blocked constitutional decisions must not emit execution plans');
    assert.equal(blocked, 1, 'blocked constitutional decisions must emit blocked execution state');
}
async function run() {
    await testConstitutionalDecisionDrivesExecutionLifecycle();
    testBlockedConstitutionalDecisionDoesNotEmitPlan();
    process.stdout.write('execution-lifecycle-ok\n');
}
await run();
