import { strict as assert } from 'node:assert';
import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { DecisionSnapshotEvent, DecisionSnapshotInvalidEvent } from '../core/schemas/events.js';
import { SnapshotSyncService } from '../services/snapshot-sync/service.js';

function testInvalidWhenSourcesMissing(): void {
  const bus = new EventBus();
  const sync = new SnapshotSyncService(bus, {
    defaultContractId: 'KXBTC-SNAP',
    maxSourceAgeMs: 2_500,
    maxClockDriftMs: 1_200,
  });
  sync.start();

  let invalid: any = null;
  bus.on<DecisionSnapshotInvalidEvent>(EVENTS.DECISION_SNAPSHOT_INVALID, (event) => {
    invalid = event;
  });

  const now = Date.now();
  bus.emit(EVENTS.MARKET_DATA, {
    contractId: 'KXBTC-SNAP',
    yesPrice: 0.5,
    noPrice: 0.5,
    spread: 0.01,
    bidLevels: [[0.49, 100]],
    askLevels: [[0.51, 100]],
    volume: 1000,
    timestamp: now,
  });

  assert.ok(invalid !== null, 'expected invalid cycle while required sources are missing');
  if (!invalid) {
    throw new Error('invalid event missing');
  }
  const invalidEvent = invalid;
  assert.equal(invalidEvent.reason, 'missing-source');
  assert.ok((invalidEvent.missingSources?.length ?? 0) > 0, 'expected missing source names');
}

function testSnapshotReadyWhenSourcesSynchronized(): void {
  const bus = new EventBus();
  const sync = new SnapshotSyncService(bus, {
    defaultContractId: 'KXBTC-SNAP',
    maxSourceAgeMs: 2_500,
    maxClockDriftMs: 1_200,
  });
  sync.start();

  let ready: any = null;
  bus.on<DecisionSnapshotEvent>(EVENTS.DECISION_SNAPSHOT, (event) => {
    ready = event;
  });

  const now = Date.now();
  bus.emit(EVENTS.MARKET_DATA, {
    contractId: 'KXBTC-SNAP',
    yesPrice: 0.51,
    noPrice: 0.49,
    spread: 0.01,
    bidLevels: [[0.5, 100]],
    askLevels: [[0.52, 100]],
    volume: 1200,
    timestamp: now,
  });
  bus.emit(EVENTS.MICROSTRUCTURE, {
    contractId: 'KXBTC-SNAP',
    obi: 0.2,
    obiVelocity: 0.05,
    liquidityPressureScore: 0.3,
    spreadExpansionScore: 0.1,
    sweepProbability: 0.08,
    panicRepricing: false,
    liquidityRegime: 'normal',
    aggressionScore: 0.2,
    timestamp: now + 5,
  });
  bus.emit(EVENTS.FEATURES, {
    contractId: 'KXBTC-SNAP',
    impliedProbability: 0.51,
    probabilityVelocity: 0.02,
    volatility: 0.12,
    spreadExpansionScore: 0.1,
    obi: 0.2,
    sweepProbability: 0.08,
    pressureAcceleration: 0.01,
    timeToExpirySeconds: 800,
    timestamp: now + 10,
  });
  bus.emit(EVENTS.PROBABILITY, {
    contractId: 'KXBTC-SNAP',
    estimatedProbability: 0.53,
    marketImpliedProbability: 0.51,
    edge: 0.02,
    confidenceInterval: [0.49, 0.57],
    uncertaintyScore: 0.15,
    calibrationError: 0.03,
    brierScore: 0.1,
    regime: 'trending',
    timestamp: now + 12,
  });
  bus.emit(EVENTS.CALIBRATION_UPDATE, {
    contractId: 'KXBTC-SNAP',
    ece: 0.04,
    brier: 0.1,
    calibratedConfidence: 0.81,
    timestamp: now + 16,
  });
  bus.emit(EVENTS.DRIFT_EVENT, {
    contractId: 'KXBTC-SNAP',
    psi: 0.05,
    kl: 0.04,
    severity: 'low',
    timestamp: now + 18,
  });

  assert.ok(ready !== null, 'expected synchronized snapshot event');
  if (!ready) {
    throw new Error('ready snapshot missing');
  }
  const readySnapshot = ready;
  assert.ok(readySnapshot.snapshot_id.startsWith('KXBTC-SNAP:'), 'expected deterministic snapshot id format');
  assert.equal(readySnapshot.triggerEvent, EVENTS.DRIFT_EVENT, 'expected snapshot trigger to match latest source update');
  assert.equal(readySnapshot.market_state_hash.length, 64, 'expected sha256 market hash length');
  assert.ok(readySnapshot.sourceMeta.length >= 6, 'expected source metadata in snapshot');
}

function run(): void {
  testInvalidWhenSourcesMissing();
  testSnapshotReadyWhenSourcesSynchronized();
  process.stdout.write('snapshot-sync-ok\n');
}

run();
