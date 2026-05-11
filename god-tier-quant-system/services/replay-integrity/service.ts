import { EventBus } from '../../core/event-bus/bus.js';
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

    const payload: ReplayIntegrityEvent = {
      timestamp: Date.now(),
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

function hashRecords(records: Array<{ event: string; payload: unknown }>): string {
  const hash = createHash('sha256');
  for (const record of records) {
    hash.update(record.event);
    hash.update(':');
    hash.update(JSON.stringify(record.payload));
    hash.update('\n');
  }
  return hash.digest('hex');
}
