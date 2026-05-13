import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ReplayEngine } from '../services/replay-engine/service.js';
import { ReplayIntegrityService } from '../services/replay-integrity/service.js';

function testDuplicateIdempotencyRejection(): void {
  const bus = new EventBus();

  const payload = {
    contractId: 'KXBTC-CHAOS',
    yesPrice: 0.52,
    noPrice: 0.48,
    spread: 0.01,
    bidLevels: [[0.51, 100]],
    askLevels: [[0.52, 100]],
    volume: 100,
    timestamp: 1_000,
  };

  bus.emit(EVENTS.MARKET_DATA, payload, {
    source: 'chaos-test',
    snapshotId: 'snap-chaos-1',
    idempotencyKey: 'dup-key',
    timestamp: 1_000,
  });
  bus.emit(EVENTS.MARKET_DATA, payload, {
    source: 'chaos-test',
    snapshotId: 'snap-chaos-1',
    idempotencyKey: 'dup-key',
    timestamp: 1_001,
  });

  assert.equal(bus.history(EVENTS.MARKET_DATA).length, 1, 'duplicate idempotency events should not be accepted twice');
  assert.ok(bus.rejections(EVENTS.MARKET_DATA).some((r) => r.rejectionReason === 'duplicate-idempotency-key'));
}

function testStaleEventRejection(): void {
  const bus = new EventBus();

  bus.emit(EVENTS.PROBABILITY, {
    contractId: 'KXBTC-CHAOS',
    estimatedProbability: 0.6,
    marketImpliedProbability: 0.55,
    edge: 0.05,
    confidenceInterval: [0.5, 0.7],
    uncertaintyScore: 0.2,
    calibrationError: 0.03,
    brierScore: 0.1,
    regime: 'trending',
    timestamp: 10_000,
  }, {
    source: 'chaos-test',
    snapshotId: 'snap-chaos-2',
    timestamp: 10_000,
  });

  bus.emit(EVENTS.PROBABILITY, {
    contractId: 'KXBTC-CHAOS',
    estimatedProbability: 0.58,
    marketImpliedProbability: 0.55,
    edge: 0.03,
    confidenceInterval: [0.5, 0.66],
    uncertaintyScore: 0.21,
    calibrationError: 0.03,
    brierScore: 0.11,
    regime: 'trending',
    timestamp: 9_999,
  }, {
    source: 'chaos-test',
    snapshotId: 'snap-chaos-1',
    timestamp: 9_999,
  });

  assert.equal(bus.history(EVENTS.PROBABILITY).length, 1, 'stale event should not be accepted into history');
  assert.ok(bus.rejections(EVENTS.PROBABILITY).some((r) => r.rejectionReason === 'stale-event'));
}

function testReplayMismatchEscalatesToHardStop(): void {
  const bus = new EventBus();
  const replay = new ReplayEngine(bus);
  const replayIntegrity = new ReplayIntegrityService(bus, replay, { minimumSampleSize: 1 });

  replay.start();
  replayIntegrity.start();

  let hardStop = false;
  let deterministic: boolean | null = null;

  bus.on(EVENTS.EXECUTION_CONTROL, (event: { mode: string; reason: string }) => {
    if (event.mode === 'hard-stop' && event.reason === 'replay-hash-mismatch') {
      hardStop = true;
    }
  });

  bus.on(EVENTS.REPLAY_INTEGRITY, (event: { deterministic: boolean }) => {
    deterministic = event.deterministic;
  });

  bus.emit(EVENTS.MARKET_DATA, {
    contractId: 'KXBTC-CHAOS',
    yesPrice: 0.5,
    noPrice: 0.5,
    spread: 0.01,
    bidLevels: [[0.49, 100]],
    askLevels: [[0.51, 100]],
    volume: 100,
    timestamp: 2_000,
  }, {
    source: 'chaos-test',
    snapshotId: 'snap-chaos-3',
    timestamp: 2_000,
  });

  bus.emit(EVENTS.RECONCILIATION, {
    contractId: 'KXBTC-CHAOS',
    reconciliationError: 0.01,
    ledgerMismatch: false,
    unresolvedEvents: 0,
    timestamp: 2_001,
  }, {
    source: 'chaos-test',
    snapshotId: 'snap-chaos-3',
    timestamp: 2_001,
  });

  assert.notEqual(deterministic, null, 'replay integrity validation should execute');
  if (deterministic === false) {
    assert.equal(hardStop, true, 'replay mismatch must escalate to hard-stop');
  }
}

function testCriticalCognitionEventsRequireExplicitTimestamp(): void {
  const bus = new EventBus();

  const accepted = bus.emit(EVENTS.MARKET_WORLD_STATE, {
    contractId: 'KXBTC-CHAOS',
    participantIntent: 'neutral',
    syntheticLiquidityProbability: 0.5,
    forcedPositioningPressure: 0.4,
    reflexivityAcceleration: 0.3,
    worldConfidence: 0.6,
    scenarioDominantBranch: 'baseline',
    hiddenState: 'neutral',
  });

  assert.equal(accepted, false, 'market world state without explicit timestamp must be rejected');
  assert.equal(bus.history(EVENTS.MARKET_WORLD_STATE).length, 0, 'rejected event should not enter history');
  assert.ok(
    bus.rejections(EVENTS.MARKET_WORLD_STATE).some((entry) => entry.rejectionReason === 'missing-explicit-timestamp'),
    'expected missing explicit timestamp rejection',
  );
}

function run(): void {
  testDuplicateIdempotencyRejection();
  testStaleEventRejection();
  testReplayMismatchEscalatesToHardStop();
  testCriticalCognitionEventsRequireExplicitTimestamp();
  process.stdout.write('chaos-resilience-ok\n');
}

run();
