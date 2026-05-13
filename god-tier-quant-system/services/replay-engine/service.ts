import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { createHash } from 'node:crypto';

export interface ReplayRecord {
  sequence: number;
  event: string;
  payload: unknown;
  sourceTimestamp: number;
  receiveTimestamp: number;
  timestamp: number;
  snapshotId: string;
  source: string;
  lineageId: string;
  idempotencyKey?: string;
}

export class ReplayEngine {
  private readonly tracked = [
    EVENTS.MARKET_DATA,
    EVENTS.MICROSTRUCTURE,
    EVENTS.FEATURES,
    EVENTS.PROBABILITY,
    EVENTS.CALIBRATION_UPDATE,
    EVENTS.DRIFT_EVENT,
    EVENTS.MARKET_PHYSICS,
    EVENTS.SCENARIO_BRANCH_STATE,
    EVENTS.CROSS_MARKET_CAUSAL_STATE,
    EVENTS.MARKET_WORLD_STATE,
    EVENTS.META_CALIBRATION,
    EVENTS.EPISTEMIC_MEMORY_REVISION,
    EVENTS.MARKET_EXPERIENCE,
    EVENTS.SELF_IMPROVEMENT,
    EVENTS.DECISION_SNAPSHOT,
    EVENTS.CONSTITUTIONAL_DECISION,
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
    EVENTS.OPERATOR_ATTENTION,
  ];

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.history(this.tracked);
  }

  replay(targetBus: EventBus): void {
    for (const record of this.getRecords()) {
      targetBus.emit(EVENTS.REPLAY_EVENT, record);
      targetBus.emit(record.event, record.payload, {
        timestamp: record.timestamp,
        snapshotId: record.snapshotId,
        source: record.source,
        idempotencyKey: record.idempotencyKey,
      });
    }
  }

  getRecords(): ReplayRecord[] {
    return this.bus.history(this.tracked).map((record) => ({
      sequence: record.sequence,
      event: record.event,
      payload: record.payload,
      sourceTimestamp: record.sourceTimestamp,
      receiveTimestamp: record.receiveTimestamp,
      timestamp: record.timestamp,
      snapshotId: record.snapshotId,
      source: record.source,
      lineageId: record.lineageId,
      idempotencyKey: record.idempotencyKey,
    }));
  }

  checksum(): string {
    const hash = createHash('sha256');
    for (const record of this.getRecords()) {
      hash.update(record.event);
      hash.update(':');
      hash.update(stableStringify(record.payload));
      hash.update('|');
      hash.update(record.snapshotId);
      hash.update('|');
      hash.update(record.source);
      hash.update('|');
      hash.update(record.idempotencyKey ?? '');
      hash.update('\n');
    }
    return hash.digest('hex');
  }
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
