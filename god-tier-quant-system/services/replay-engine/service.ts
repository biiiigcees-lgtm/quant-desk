import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { createHash } from 'node:crypto';

export interface ReplayRecord {
  sequence: number;
  event: string;
  payload: unknown;
  timestamp: number;
}

export class ReplayEngine {
  private readonly tracked = [
    EVENTS.MARKET_DATA,
    EVENTS.MICROSTRUCTURE,
    EVENTS.FEATURES,
    EVENTS.PROBABILITY,
    EVENTS.CALIBRATION_UPDATE,
    EVENTS.DRIFT_EVENT,
    EVENTS.AGGREGATED_SIGNAL,
    EVENTS.RISK_DECISION,
    EVENTS.EXECUTION_CONTROL,
    EVENTS.EXECUTION_PLAN,
    EVENTS.EXECUTION_STATE,
    EVENTS.EXECUTION_ALPHA,
    EVENTS.ORDER_EVENT,
    EVENTS.PORTFOLIO_UPDATE,
    EVENTS.RECONCILIATION,
    EVENTS.VALIDATION_RESULT,
  ];

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.history(this.tracked);
  }

  replay(targetBus: EventBus): void {
    for (const record of this.getRecords()) {
      targetBus.emit(EVENTS.REPLAY_EVENT, record);
      targetBus.emit(record.event, record.payload);
    }
  }

  getRecords(): ReplayRecord[] {
    return this.bus.history(this.tracked).map((record) => ({
      sequence: record.sequence,
      event: record.event,
      payload: record.payload,
      timestamp: record.timestamp,
    }));
  }

  checksum(): string {
    const hash = createHash('sha256');
    for (const record of this.getRecords()) {
      hash.update(JSON.stringify(record));
      hash.update('\n');
    }
    return hash.digest('hex');
  }
}
