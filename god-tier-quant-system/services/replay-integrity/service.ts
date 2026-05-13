import { EventBus } from '../../core/event-bus/bus.js';
import { LogicalClock, MonotonicLogicalClock } from '../../core/determinism/logical-clock.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { ReplayIntegrityEvent } from '../../core/schemas/events.js';
import { ReplayEngine } from '../replay-engine/service.js';
import { createHash } from 'node:crypto';

interface ReplayIntegrityOptions {
  minimumSampleSize: number;
}

export class ReplayIntegrityService {
  constructor(
    private readonly bus: EventBus,
    private readonly replayEngine: ReplayEngine,
    private readonly options: ReplayIntegrityOptions,
    private readonly clock: LogicalClock = new MonotonicLogicalClock(),
  ) {}

  start(): void {
    this.bus.on(EVENTS.RECONCILIATION, () => {
      this.validate();
    });

    this.bus.on(EVENTS.EXECUTION_STATE, () => {
      this.validate();
    });
  }

  private validate(): void {
    const sourceRecords = this.replayEngine.getRecords();
    if (sourceRecords.length < this.options.minimumSampleSize) {
      return;
    }

    const sandboxBus = new EventBus(80, sourceRecords.length + 20);
    const sandboxReplay = new ReplayEngine(sandboxBus);
    sandboxReplay.start();

    for (const record of sourceRecords) {
      sandboxBus.emit(record.event, record.payload);
    }

    const sourceChecksum = hashRecords(sourceRecords);
    const replayChecksum = hashRecords(sandboxReplay.getRecords());
    const deterministic = sourceChecksum === replayChecksum;

    const timestamp = this.clock.tick();
    const payload: ReplayIntegrityEvent = {
      timestamp,
      deterministic,
      sourceChecksum,
      replayChecksum,
      sampleSize: sourceRecords.length,
    };

    this.bus.emit(EVENTS.REPLAY_INTEGRITY, payload);
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'organism.replay.deterministic',
      value: deterministic ? 1 : 0,
      tags: { sampleSize: String(payload.sampleSize) },
      timestamp: payload.timestamp,
    });

    if (!deterministic) {
      this.bus.emit(EVENTS.EXECUTION_CONTROL, {
        contractId: 'SYSTEM',
        mode: 'hard-stop',
        reason: 'replay-hash-mismatch',
        timestamp: payload.timestamp,
      });
      this.bus.emit(EVENTS.ANOMALY, {
        contractId: 'SYSTEM',
        type: 'strategy-instability',
        severity: 'critical',
        confidenceDegradation: 0.9,
        details: 'Replay checksum mismatch detected during integrity validation',
        timestamp: payload.timestamp,
      });
    }
  }
}

function hashRecords(
  records: Array<{
    event: string;
    payload: unknown;
    snapshotId?: string;
    source?: string;
    idempotencyKey?: string;
  }>,
): string {
  const hash = createHash('sha256');
  for (const record of records) {
    hash.update(record.event);
    hash.update(':');
    hash.update(stableStringify(record.payload));
    hash.update('|');
    hash.update(record.snapshotId ?? 'na');
    hash.update('|');
    hash.update(record.source ?? record.event);
    hash.update('|');
    hash.update(record.idempotencyKey ?? '');
    hash.update('\n');
  }
  return hash.digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((left, right) => left.localeCompare(right));
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(',')}}`;
}
