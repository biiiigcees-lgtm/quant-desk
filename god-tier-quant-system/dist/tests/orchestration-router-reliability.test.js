import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { AiAgentRouterService } from '../services/ai-orchestration/router/service.js';
class AlwaysFailProvider {
    constructor() {
        this.calls = 0;
    }
    async run() {
        this.calls += 1;
        throw new Error('provider-failure');
    }
}
async function testCircuitBreakerSkipsAfterThreshold() {
    const bus = new EventBus();
    const provider = new AlwaysFailProvider();
    const router = new AiAgentRouterService(bus, provider, {
        enabled: true,
        defaultContractId: 'KXBTC-REL',
        shadowMode: false,
        scheduler: { maxParallel: 8 },
        circuitBreaker: { failureThreshold: 1, cooldownMs: 60000 },
    });
    router.start();
    let failures = 0;
    const errorTypes = [];
    bus.on(EVENTS.AI_AGENT_FAILURE, (event) => {
        failures += 1;
        errorTypes.push(event.error);
    });
    // First snapshot should attempt provider call and fail.
    bus.emit(EVENTS.DECISION_SNAPSHOT, makeSnapshot('snap-a', Date.now()));
    await new Promise((resolve) => setTimeout(resolve, 25));
    // Wait past execution-intelligence debounce window so a second routing attempt occurs.
    await new Promise((resolve) => setTimeout(resolve, 800));
    // Second event should be blocked by open circuit and not call provider.
    bus.emit(EVENTS.DECISION_SNAPSHOT, makeSnapshot('snap-b', Date.now() + 1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(provider.calls, 1, 'provider should be called once before circuit opens');
    assert.ok(failures >= 2, 'expected provider failure and circuit-open failure events');
    assert.ok(errorTypes.includes('circuit-open'), 'expected circuit-open failure emission');
}
async function run() {
    await testCircuitBreakerSkipsAfterThreshold();
    process.stdout.write('orchestration-router-reliability-ok\n');
}
await run();
function makeSnapshot(snapshotId, now) {
    return {
        snapshot_id: snapshotId,
        contractId: 'KXBTC-REL',
        triggerEvent: EVENTS.EXECUTION_PLAN,
        timestamp: now,
        market_state_hash: `${snapshotId}-hash`,
        eventSequence: 1,
        sourceMeta: [],
        state: {
            marketData: {
                contractId: 'KXBTC-REL',
                yesPrice: 0.5,
                noPrice: 0.5,
                spread: 0.01,
                bidLevels: [[0.49, 100]],
                askLevels: [[0.51, 100]],
                volume: 1000,
                timestamp: now,
            },
            microstructure: {
                contractId: 'KXBTC-REL',
                obi: 0,
                obiVelocity: 0,
                liquidityPressureScore: 0,
                spreadExpansionScore: 0,
                sweepProbability: 0,
                panicRepricing: false,
                liquidityRegime: 'normal',
                aggressionScore: 0,
                timestamp: now,
            },
            features: {
                contractId: 'KXBTC-REL',
                impliedProbability: 0.5,
                probabilityVelocity: 0,
                volatility: 0.1,
                spreadExpansionScore: 0,
                obi: 0,
                sweepProbability: 0,
                pressureAcceleration: 0,
                timeToExpirySeconds: 600,
                timestamp: now,
            },
            probability: {
                contractId: 'KXBTC-REL',
                estimatedProbability: 0.52,
                marketImpliedProbability: 0.5,
                edge: 0.02,
                confidenceInterval: [0.48, 0.56],
                uncertaintyScore: 0.2,
                calibrationError: 0.03,
                brierScore: 0.1,
                regime: 'trending',
                timestamp: now,
            },
            calibration: {
                contractId: 'KXBTC-REL',
                ece: 0.04,
                brier: 0.1,
                calibratedConfidence: 0.8,
                timestamp: now,
            },
            drift: {
                contractId: 'KXBTC-REL',
                psi: 0.05,
                kl: 0.04,
                severity: 'low',
                timestamp: now,
            },
            anomaly: null,
            executionPlan: null,
        },
    };
}
