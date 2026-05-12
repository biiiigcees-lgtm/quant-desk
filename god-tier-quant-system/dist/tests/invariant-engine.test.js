import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { InvariantEngineService } from '../services/invariant-engine/service.js';
function testSnapshotSequenceRegressionTriggersHardStop() {
    const bus = new EventBus();
    new InvariantEngineService(bus).start();
    const controlReasons = [];
    bus.on(EVENTS.EXECUTION_CONTROL, (event) => {
        if (event.mode === 'hard-stop') {
            controlReasons.push(event.reason);
        }
    });
    bus.emit(EVENTS.DECISION_SNAPSHOT, {
        snapshot_id: 'KXBTC:2:hash2',
        contractId: 'KXBTC',
        triggerEvent: EVENTS.MARKET_DATA,
        timestamp: 2000,
        market_state_hash: '2'.repeat(64),
        eventSequence: 2,
        sourceMeta: [],
        state: {
            marketData: { contractId: 'KXBTC', yesPrice: 0.52, noPrice: 0.48, spread: 0.01, bidLevels: [[0.51, 100]], askLevels: [[0.52, 100]], volume: 100, timestamp: 2000 },
            microstructure: { contractId: 'KXBTC', obi: 0.1, spreadBps: 10, depthImbalance: 0.05, sweepRisk: 0.01, liquidityRegime: 'normal', timestamp: 2000 },
            features: { contractId: 'KXBTC', impliedProbability: 0.52, probabilityVelocity: 0.01, volatility: 0.1, spreadExpansionScore: 0.1, obi: 0.1, sweepProbability: 0.1, pressureAcceleration: 0.01, timeToExpirySeconds: 1200, timestamp: 2000 },
            probability: { contractId: 'KXBTC', estimatedProbability: 0.52, marketImpliedProbability: 0.5, edge: 0.02, confidenceInterval: [0.48, 0.56], uncertaintyScore: 0.2, calibrationError: 0.03, brierScore: 0.09, regime: 'trending', timestamp: 2000 },
            calibration: { contractId: 'KXBTC', ece: 0.03, brier: 0.09, calibratedConfidence: 0.8, timestamp: 2000 },
            drift: { contractId: 'KXBTC', psi: 0.01, kl: 0.01, severity: 'low', featureContributions: {}, timestamp: 2000 },
            anomaly: null,
            executionPlan: null,
        },
        canonical: {
            snapshotId: 'KXBTC:2:hash2',
            contractId: 'KXBTC',
            sequence: 2,
            timestamp: 2000,
            hash: '2'.repeat(64),
            sourceMeta: [],
            market: { contractId: 'KXBTC', yesPrice: 0.52, noPrice: 0.48, spread: 0.01, bidLevels: [[0.51, 100]], askLevels: [[0.52, 100]], volume: 100, timestamp: 2000 },
            orderbook: { yesPrice: 0.52, noPrice: 0.48, spread: 0.01, bidLevels: [[0.51, 100]], askLevels: [[0.52, 100]], volume: 100 },
            microstructure: { contractId: 'KXBTC', obi: 0.1, spreadBps: 10, depthImbalance: 0.05, sweepRisk: 0.01, liquidityRegime: 'normal', timestamp: 2000 },
            indicators: { contractId: 'KXBTC', impliedProbability: 0.52, probabilityVelocity: 0.01, volatility: 0.1, spreadExpansionScore: 0.1, obi: 0.1, sweepProbability: 0.1, pressureAcceleration: 0.01, timeToExpirySeconds: 1200, timestamp: 2000 },
            ai: {
                probability: { contractId: 'KXBTC', estimatedProbability: 0.52, marketImpliedProbability: 0.5, edge: 0.02, confidenceInterval: [0.48, 0.56], uncertaintyScore: 0.2, calibrationError: 0.03, brierScore: 0.09, regime: 'trending', timestamp: 2000 },
                calibration: { contractId: 'KXBTC', ece: 0.03, brier: 0.09, calibratedConfidence: 0.8, timestamp: 2000 },
                drift: { contractId: 'KXBTC', psi: 0.01, kl: 0.01, severity: 'low', featureContributions: {}, timestamp: 2000 },
                anomaly: null,
            },
            aiContext: {
                probability: { contractId: 'KXBTC', estimatedProbability: 0.52, marketImpliedProbability: 0.5, edge: 0.02, confidenceInterval: [0.48, 0.56], uncertaintyScore: 0.2, calibrationError: 0.03, brierScore: 0.09, regime: 'trending', timestamp: 2000 },
                calibration: { contractId: 'KXBTC', ece: 0.03, brier: 0.09, calibratedConfidence: 0.8, timestamp: 2000 },
                drift: { contractId: 'KXBTC', psi: 0.01, kl: 0.01, severity: 'low', featureContributions: {}, timestamp: 2000 },
                anomaly: null,
            },
            risk: { executionPermission: true, safetyMode: 'normal', reason: 'ok', riskLevel: 10 },
            riskState: { executionPermission: true, safetyMode: 'normal', reason: 'ok', riskLevel: 10 },
            execution: null,
            executionState: null,
            epistemic: { uncertaintyScore: 0.2, calibrationError: 0.03, driftSeverity: 'low', anomalySeverity: 'none', truthScore: 0.77 },
        },
    });
    bus.emit(EVENTS.DECISION_SNAPSHOT, {
        snapshot_id: 'KXBTC:1:hash1',
        contractId: 'KXBTC',
        triggerEvent: EVENTS.MARKET_DATA,
        timestamp: 1000,
        market_state_hash: '1'.repeat(64),
        eventSequence: 1,
        sourceMeta: [],
        state: {
            marketData: { contractId: 'KXBTC', yesPrice: 0.51, noPrice: 0.49, spread: 0.01, bidLevels: [[0.5, 100]], askLevels: [[0.51, 100]], volume: 100, timestamp: 1000 },
            microstructure: { contractId: 'KXBTC', obi: 0.1, spreadBps: 10, depthImbalance: 0.05, sweepRisk: 0.01, liquidityRegime: 'normal', timestamp: 1000 },
            features: { contractId: 'KXBTC', impliedProbability: 0.51, probabilityVelocity: 0.01, volatility: 0.1, spreadExpansionScore: 0.1, obi: 0.1, sweepProbability: 0.1, pressureAcceleration: 0.01, timeToExpirySeconds: 1200, timestamp: 1000 },
            probability: { contractId: 'KXBTC', estimatedProbability: 0.51, marketImpliedProbability: 0.5, edge: 0.01, confidenceInterval: [0.47, 0.55], uncertaintyScore: 0.2, calibrationError: 0.03, brierScore: 0.09, regime: 'trending', timestamp: 1000 },
            calibration: { contractId: 'KXBTC', ece: 0.03, brier: 0.09, calibratedConfidence: 0.8, timestamp: 1000 },
            drift: { contractId: 'KXBTC', psi: 0.01, kl: 0.01, severity: 'low', featureContributions: {}, timestamp: 1000 },
            anomaly: null,
            executionPlan: null,
        },
        canonical: {
            snapshotId: 'KXBTC:1:hash1',
            contractId: 'KXBTC',
            sequence: 1,
            timestamp: 1000,
            hash: '1'.repeat(64),
            sourceMeta: [],
            market: { contractId: 'KXBTC', yesPrice: 0.51, noPrice: 0.49, spread: 0.01, bidLevels: [[0.5, 100]], askLevels: [[0.51, 100]], volume: 100, timestamp: 1000 },
            orderbook: { yesPrice: 0.51, noPrice: 0.49, spread: 0.01, bidLevels: [[0.5, 100]], askLevels: [[0.51, 100]], volume: 100 },
            microstructure: { contractId: 'KXBTC', obi: 0.1, spreadBps: 10, depthImbalance: 0.05, sweepRisk: 0.01, liquidityRegime: 'normal', timestamp: 1000 },
            indicators: { contractId: 'KXBTC', impliedProbability: 0.51, probabilityVelocity: 0.01, volatility: 0.1, spreadExpansionScore: 0.1, obi: 0.1, sweepProbability: 0.1, pressureAcceleration: 0.01, timeToExpirySeconds: 1200, timestamp: 1000 },
            ai: {
                probability: { contractId: 'KXBTC', estimatedProbability: 0.51, marketImpliedProbability: 0.5, edge: 0.01, confidenceInterval: [0.47, 0.55], uncertaintyScore: 0.2, calibrationError: 0.03, brierScore: 0.09, regime: 'trending', timestamp: 1000 },
                calibration: { contractId: 'KXBTC', ece: 0.03, brier: 0.09, calibratedConfidence: 0.8, timestamp: 1000 },
                drift: { contractId: 'KXBTC', psi: 0.01, kl: 0.01, severity: 'low', featureContributions: {}, timestamp: 1000 },
                anomaly: null,
            },
            aiContext: {
                probability: { contractId: 'KXBTC', estimatedProbability: 0.51, marketImpliedProbability: 0.5, edge: 0.01, confidenceInterval: [0.47, 0.55], uncertaintyScore: 0.2, calibrationError: 0.03, brierScore: 0.09, regime: 'trending', timestamp: 1000 },
                calibration: { contractId: 'KXBTC', ece: 0.03, brier: 0.09, calibratedConfidence: 0.8, timestamp: 1000 },
                drift: { contractId: 'KXBTC', psi: 0.01, kl: 0.01, severity: 'low', featureContributions: {}, timestamp: 1000 },
                anomaly: null,
            },
            risk: { executionPermission: true, safetyMode: 'normal', reason: 'ok', riskLevel: 10 },
            riskState: { executionPermission: true, safetyMode: 'normal', reason: 'ok', riskLevel: 10 },
            execution: null,
            executionState: null,
            epistemic: { uncertaintyScore: 0.2, calibrationError: 0.03, driftSeverity: 'low', anomalySeverity: 'none', truthScore: 0.77 },
        },
    });
    assert.ok(controlReasons.some((reason) => reason.includes('invariant-snapshot-sequence-regression')));
}
function run() {
    testSnapshotSequenceRegressionTriggersHardStop();
    process.stdout.write('invariant-engine-ok\n');
}
run();
