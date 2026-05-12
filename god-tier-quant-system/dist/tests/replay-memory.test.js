import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ReplayEngine } from '../services/replay-engine/service.js';
import { AiIntelligenceService } from '../services/ai-intelligence/service.js';
function testReplayChecksumDeterminism() {
    const bus = new EventBus();
    const replay = new ReplayEngine(bus);
    replay.start();
    bus.emit(EVENTS.MARKET_DATA, {
        contractId: 'KXBTC-T1',
        yesPrice: 0.51,
        noPrice: 0.49,
        spread: 0.01,
        bidLevels: [[0.5, 100]],
        askLevels: [[0.51, 100]],
        volume: 1000,
        timestamp: 1,
    }, {
        snapshotId: 'snapshot:test:1',
        source: 'market-feed',
        idempotencyKey: 'md-1',
        timestamp: 1,
    });
    bus.emit(EVENTS.PROBABILITY, {
        contractId: 'KXBTC-T1',
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
    const checksumA = replay.checksum();
    const checksumB = replay.checksum();
    assert.equal(checksumA, checksumB, 'replay checksum should be stable for unchanged records');
    const records = replay.getRecords();
    assert.ok(records.length >= 2, 'replay should record tracked events');
    assert.equal(records[0]?.snapshotId, 'snapshot:test:1', 'replay should preserve snapshot metadata');
    assert.equal(records[0]?.source, 'market-feed', 'replay should preserve source metadata');
    assert.equal(records[0]?.idempotencyKey, 'md-1', 'replay should preserve idempotency metadata');
}
function testAiTelemetryEmission() {
    const bus = new EventBus();
    const ai = new AiIntelligenceService(bus);
    ai.start();
    const telemetryNames = [];
    bus.on(EVENTS.TELEMETRY, (event) => {
        telemetryNames.push(event.name);
    });
    bus.emit(EVENTS.PROBABILITY, {
        contractId: 'KXBTC-T2',
        estimatedProbability: 0.57,
        marketImpliedProbability: 0.55,
        edge: 0.02,
        confidenceInterval: [0.5, 0.64],
        uncertaintyScore: 0.19,
        calibrationError: 0.03,
        brierScore: 0.09,
        regime: 'compression',
        timestamp: 3,
    });
    bus.emit(EVENTS.ANOMALY, {
        contractId: 'KXBTC-T2',
        type: 'calibration-drift',
        severity: 'medium',
        confidenceDegradation: 0.1,
        details: 'test anomaly',
        timestamp: 4,
    });
    assert.ok(telemetryNames.includes('ai.memory.regime.recorded'));
    assert.ok(telemetryNames.includes('ai.memory.anomaly.recorded'));
    assert.ok(ai.recentNarratives(5).length > 0, 'AI memory should store observations');
}
function run() {
    testReplayChecksumDeterminism();
    testAiTelemetryEmission();
    process.stdout.write('replay-memory-ok\n');
}
run();
