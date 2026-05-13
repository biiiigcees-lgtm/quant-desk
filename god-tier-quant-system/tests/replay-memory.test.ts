import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { ReplayStorage } from '../core/replay/storage.js';
import { ReplayEngine } from '../services/replay-engine/service.js';
import { PersistentEventLog } from '../services/replay-engine/persistent-log.js';
import { AiIntelligenceService } from '../services/ai-intelligence/service.js';

function testReplayChecksumDeterminism(): void {
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

function testAiTelemetryEmission(): void {
  const bus = new EventBus();
  const ai = new AiIntelligenceService(bus);
  ai.start();

  const telemetryNames: string[] = [];
  bus.on<{ name: string }>(EVENTS.TELEMETRY, (event) => {
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

function testReplayStorageResumesSequenceAfterRestart(): void {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'replay-storage-'));
  const filePath = path.join(tmpDir, 'events.log');

  try {
    const firstWriter = new ReplayStorage(filePath);
    const first = firstWriter.append('e1', { v: 1 });
    const second = firstWriter.append('e2', { v: 2 });

    const restartedWriter = new ReplayStorage(filePath);
    const third = restartedWriter.append('e3', { v: 3 });

    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
    assert.equal(third.sequence, 3, 'sequence should continue from disk state after restart');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testReplayStateAtSequence(): void {
  const bus = new EventBus();
  const replay = new ReplayEngine(bus);

  bus.emit(EVENTS.EXECUTION_CONTROL, {
    mode: 'safe-mode',
    reason: 'initial-risk',
    timestamp: 1,
  });

  bus.emit(EVENTS.EXECUTION_STATE, {
    executionId: 'exec-1',
    contractId: 'KXBTC-T3',
    phase: 'queued',
    reason: 'initial-risk',
    safetyMode: 'safe-mode',
    timestamp: 2,
  });

  bus.emit(EVENTS.EXECUTION_CONTROL, {
    mode: 'hard-stop',
    reason: 'drift-critical',
    timestamp: 3,
  });

  const stateAtTwo = replay.getStateAtSequence(2) as {
    executionControl?: { mode: string; reason: string };
    executionState?: { phase: string };
  };
  const stateAtThree = replay.getStateAtSequence(3) as {
    executionControl?: { mode: string; reason: string };
    executionState?: { phase: string };
  };

  assert.equal(stateAtTwo.executionControl?.mode, 'safe-mode', 'state reconstruction should use only events up to the target sequence');
  assert.equal(stateAtTwo.executionState?.phase, 'queued', 'state reconstruction should preserve prior execution state');
  assert.equal(stateAtThree.executionControl?.mode, 'hard-stop', 'later state reconstruction should include newer control events');
}

async function testPersistentEventLogHydration(): Promise<void> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'persistent-replay-'));
  const filePath = path.join(tmpDir, 'events.log');

  try {
    const sourceBus = new EventBus();
    const sourceStorage = new ReplayStorage(filePath);
    const sourcePersistentLog = new PersistentEventLog(sourceBus, sourceStorage, {
      persistedEvents: [EVENTS.EXECUTION_CONTROL, EVENTS.EXECUTION_STATE],
    });
    sourcePersistentLog.start();

    sourceBus.emit(EVENTS.EXECUTION_CONTROL, {
      mode: 'safe-mode',
      reason: 'feed-risk',
      timestamp: 10,
    });
    sourceBus.emit(EVENTS.EXECUTION_STATE, {
      executionId: 'exec-hydrate-1',
      contractId: 'KXBTC-H1',
      phase: 'queued',
      reason: 'feed-risk',
      safetyMode: 'safe-mode',
      timestamp: 11,
    });
    sourcePersistentLog.stop();

    const targetBus = new EventBus();
    const targetStorage = new ReplayStorage(filePath);
    const targetPersistentLog = new PersistentEventLog(targetBus, targetStorage, {
      persistedEvents: [EVENTS.EXECUTION_CONTROL, EVENTS.EXECUTION_STATE],
    });
    const hydratedCount = await targetPersistentLog.hydrateBus();
    targetPersistentLog.stop();

    assert.equal(hydratedCount, 2, 'startup hydration should replay persisted events into bus history');

    const replay = new ReplayEngine(targetBus);
    const hydratedState = replay.deriveState() as {
      executionControl?: { mode: string };
      executionState?: { phase: string };
    };
    assert.equal(hydratedState.executionControl?.mode, 'safe-mode', 'hydrated state should include persisted execution control');
    assert.equal(hydratedState.executionState?.phase, 'queued', 'hydrated state should include persisted execution state');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testReplayStorageRotationKeepsReplayableHistory(): Promise<void> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'replay-rotation-'));
  const filePath = path.join(tmpDir, 'events.log');

  try {
    const storage = new ReplayStorage(filePath, {
      maxFileSizeBytes: 120,
      maxArchivedFiles: 4,
    });

    storage.append('rotation:e1', { payload: 'x'.repeat(180) }, { timestamp: 1 });
    storage.append('rotation:e2', { payload: 'y'.repeat(180) }, { timestamp: 2 });
    storage.append('rotation:e3', { payload: 'z'.repeat(180) }, { timestamp: 3 });

    const records = await storage.readAll();
    assert.equal(records.length, 3, 'archive rotation should preserve replayable history across segments');
    assert.deepEqual(records.map((record) => record.sequence), [1, 2, 3], 'readAll should return records in sequence order across archives');

    const replayed: number[] = [];
    const replayedCount = await storage.replay((record) => {
      replayed.push(record.sequence);
    });
    assert.equal(replayedCount, 3, 'replay should include records from active log and archives');
    assert.deepEqual(replayed, [1, 2, 3], 'replay should preserve deterministic ordering across rotated logs');

    const restartedStorage = new ReplayStorage(filePath, {
      maxFileSizeBytes: 120,
      maxArchivedFiles: 4,
    });
    const next = restartedStorage.append('rotation:e4', { payload: 'w'.repeat(10) }, { timestamp: 4 });
    assert.equal(next.sequence, 4, 'sequence should resume correctly after rotation and restart');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function run(): Promise<void> {
  testReplayChecksumDeterminism();
  testAiTelemetryEmission();
  testReplayStorageResumesSequenceAfterRestart();
  testReplayStateAtSequence();
  await testPersistentEventLogHydration();
  await testReplayStorageRotationKeepsReplayableHistory();
  process.stdout.write('replay-memory-ok\n');
}

await run();
