import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ExecutionIntelligenceEngine } from '../services/execution-intelligence/service.js';
import { AdaptiveRiskEngine } from '../services/adaptive-risk/service.js';
function testAiCannotTriggerExecutionDirectly() {
    const bus = new EventBus();
    new ExecutionIntelligenceEngine(bus).start();
    let executionPlanCount = 0;
    bus.on(EVENTS.EXECUTION_PLAN, () => {
        executionPlanCount += 1;
    });
    bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, {
        contractId: 'KXBTC-AUTH',
        execution_recommendation: {
            orderStyle: 'sliced',
            slices: 8,
            timingMs: 150,
            expectedSlippage: 0.02,
            fillProbability: 0.7,
            confidence: 0.95,
        },
        timestamp: Date.now(),
    });
    assert.equal(executionPlanCount, 0, 'AI aggregated intelligence must not produce execution plans without deterministic risk decision');
}
function testHardStopStillBlocksEvenWithAiAdvice() {
    const bus = new EventBus();
    new ExecutionIntelligenceEngine(bus).start();
    let blockedCount = 0;
    let executionPlanCount = 0;
    bus.on(EVENTS.EXECUTION_STATE, (event) => {
        if (event.phase === 'blocked') {
            blockedCount += 1;
        }
    });
    bus.on(EVENTS.EXECUTION_PLAN, () => {
        executionPlanCount += 1;
    });
    bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, {
        contractId: 'KXBTC-AUTH',
        execution_recommendation: {
            orderStyle: 'sliced',
            slices: 10,
            timingMs: 50,
            expectedSlippage: 0.01,
            fillProbability: 0.9,
            confidence: 0.99,
        },
        timestamp: Date.now(),
    });
    bus.emit(EVENTS.RISK_DECISION, {
        contractId: 'KXBTC-AUTH',
        approved: false,
        reason: 'hard-stop-enforced',
        direction: 'YES',
        size: 250,
        limitPrice: 0.53,
        ruinProbability: 1,
        safetyMode: 'hard-stop',
        timestamp: Date.now(),
    });
    assert.equal(blockedCount, 1, 'hard-stop rejection must produce blocked execution state');
    assert.equal(executionPlanCount, 0, 'hard-stop rejection must not emit execution plan even with AI advice');
}
function testAiRiskAdviceIsBoundedToSizing() {
    const bus = new EventBus();
    new AdaptiveRiskEngine(bus, 10000, 0.02).start();
    const riskDecisions = [];
    bus.on(EVENTS.RISK_DECISION, (event) => {
        riskDecisions.push({ size: event.size, approved: event.approved });
    });
    bus.emit(EVENTS.AGGREGATED_SIGNAL, {
        contractId: 'KXBTC-AUTH',
        direction: 'YES',
        score: 80,
        agreement: 88,
        strategyWeights: {},
        strategySignals: [],
        regime: 'trending',
        timestamp: Date.now(),
    });
    bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, {
        contractId: 'KXBTC-AUTH',
        risk_level: {
            score: 95,
            recommendation: 'de-risk',
            confidence: 0.91,
        },
        timestamp: Date.now(),
    });
    bus.emit(EVENTS.AGGREGATED_SIGNAL, {
        contractId: 'KXBTC-AUTH',
        direction: 'YES',
        score: 80,
        agreement: 88,
        strategyWeights: {},
        strategySignals: [],
        regime: 'trending',
        timestamp: Date.now() + 1,
    });
    assert.ok(riskDecisions.length >= 2, 'expected baseline and de-risked decisions');
    const baseline = riskDecisions[0];
    const deRisked = riskDecisions[1];
    assert.ok(baseline.size > deRisked.size, 'de-risk recommendation should reduce sizing');
    assert.ok(deRisked.size > 0, 'de-risk is advisory and bounded, not forced to zero by AI alone');
}
function run() {
    testAiCannotTriggerExecutionDirectly();
    testHardStopStillBlocksEvenWithAiAdvice();
    testAiRiskAdviceIsBoundedToSizing();
    process.stdout.write('orchestration-authority-ok\n');
}
run();
