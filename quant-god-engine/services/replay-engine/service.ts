import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { createHash } from 'node:crypto';

export interface ReplayRecord {
  event: string;
  payload: unknown;
  timestamp: number;
}

export class ReplayEngine {
  private readonly records: ReplayRecord[] = [];

  constructor(private readonly bus: EventBus) {}

  start(): void {
    const tracked = [
      EVENTS.MARKET_DATA,
      EVENTS.MICROSTRUCTURE,
      EVENTS.FEATURES,
      EVENTS.PROBABILITY,
      EVENTS.AGGREGATED_SIGNAL,
      EVENTS.RISK_DECISION,
      EVENTS.ORDER_EVENT,
    ];

    for (const name of tracked) {
      this.bus.on(name, (payload: unknown) => {
        this.records.push({ event: name, payload, timestamp: Date.now() });
      });
    }
  }

  replay(targetBus: EventBus): void {
    for (const record of this.records) {
      targetBus.emit(EVENTS.REPLAY_EVENT, record);
      targetBus.emit(record.event, record.payload);
    }
  }

  getRecords(): ReplayRecord[] {
    return [...this.records];
  }

  checksum(): string {
    const hash = createHash('sha256');
    for (const record of this.records) {
      hash.update(JSON.stringify(record));
      hash.update('\n');
    }
    return hash.digest('hex');
  }
}
