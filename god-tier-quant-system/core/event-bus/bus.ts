import { EventEmitter } from 'node:events';
import { EventEnvelope, EventSequencer } from '../determinism/sequencer.js';

export type Listener<T = unknown> = (event: T) => void | Promise<void>;

export interface EventValidationResult {
  valid: boolean;
  reason?: string;
}

export type EventValidator<T = unknown> = (envelope: EventEnvelope<T>) => EventValidationResult;

export interface EmitMetadata {
  snapshotId?: string;
  source?: string;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface RecordedEvent<T = unknown> {
  sequence: number;
  event: string;
  payload: T;
  timestamp: number;
  snapshotId: string;
  source: string;
  lineageId: string;
  idempotencyKey?: string;
}

export interface RejectedEvent<T = unknown> extends RecordedEvent<T> {
  rejectionReason: string;
}

export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly eventHistory: RecordedEvent[] = [];
  private readonly rejectedHistory: RejectedEvent[] = [];
  private readonly sequencer = new EventSequencer();
  private readonly validators = new Map<string, EventValidator<unknown>>();
  private readonly lastAcceptedTimestampByScope = new Map<string, number>();
  private readonly processedIdempotency = new Map<string, number>();
  private readonly maxHistory: number;
  private historyCursor = 0;
  private historyCount = 0;
  private readonly maxRejectedHistory: number;
  private readonly idempotencyTtlMs: number;

  constructor(maxListeners: number = 200, maxHistory: number = 5000, idempotencyTtlMs: number = 5 * 60 * 1000) {
    this.emitter.setMaxListeners(maxListeners);
    this.maxHistory = Math.max(100, maxHistory);
    this.maxRejectedHistory = Math.max(100, Math.floor(this.maxHistory / 2));
    this.idempotencyTtlMs = Math.max(1_000, idempotencyTtlMs);
  }

  emit<T>(event: string, payload: T, metadata?: EmitMetadata): boolean {
    const timestamp = Number.isFinite(metadata?.timestamp) ? Number(metadata?.timestamp) : extractTimestamp(payload);
    const snapshotId = metadata?.snapshotId ?? extractSnapshotId(payload) ?? 'na';
    const source = metadata?.source ?? event;
    const idempotencyKey = metadata?.idempotencyKey;
    const envelope = this.sequencer.wrap(payload, snapshotId, source, timestamp);

    const monotonic = this.sequencer.validateMonotonic(envelope);
    if (!monotonic) {
      this.recordRejected(event, envelope, 'non-monotonic-sequence', idempotencyKey);
      return false;
    }

    const builtInValidation = this.validateEnvelope(envelope);
    if (!builtInValidation.valid) {
      this.recordRejected(event, envelope, builtInValidation.reason ?? 'invalid-envelope', idempotencyKey);
      return false;
    }

    const customValidator = this.validators.get(event) as EventValidator<T> | undefined;
    if (customValidator) {
      const customValidation = customValidator(envelope);
      if (!customValidation.valid) {
        this.recordRejected(event, envelope, customValidation.reason ?? 'validator-rejected', idempotencyKey);
        return false;
      }
    }

    if (idempotencyKey) {
      this.pruneIdempotency(timestamp);
      if (this.processedIdempotency.has(idempotencyKey)) {
        this.recordRejected(event, envelope, 'duplicate-idempotency-key', idempotencyKey);
        return false;
      }
      this.processedIdempotency.set(idempotencyKey, timestamp);
    }

    const staleScope = `${event}:${source}`;
    const previousTimestamp = this.lastAcceptedTimestampByScope.get(staleScope);
    if (previousTimestamp !== undefined && timestamp < previousTimestamp) {
      this.recordRejected(event, envelope, 'stale-event', idempotencyKey);
      return false;
    }
    this.lastAcceptedTimestampByScope.set(staleScope, timestamp);

    const record: RecordedEvent = {
      sequence: envelope.sequence,
      event,
      payload,
      timestamp,
      snapshotId,
      source,
      lineageId: envelope.lineageId,
      idempotencyKey,
    };

    if (this.eventHistory.length < this.maxHistory) {
      this.eventHistory.push(record);
      this.historyCount += 1;
    } else {
      this.eventHistory[this.historyCursor] = record;
      this.historyCursor = (this.historyCursor + 1) % this.maxHistory;
      this.historyCount = this.maxHistory;
    }

    return this.emitter.emit(event, payload);
  }

  registerValidator<T>(event: string, validator: EventValidator<T>): void {
    this.validators.set(event, validator as EventValidator<unknown>);
  }

  unregisterValidator(event: string): void {
    this.validators.delete(event);
  }

  on<T>(event: string, listener: Listener<T>): void {
    this.emitter.on(event, listener);
  }

  off<T>(event: string, listener: Listener<T>): void {
    this.emitter.off(event, listener);
  }

  once<T>(event: string, listener: Listener<T>): void {
    this.emitter.once(event, listener);
  }

  history<T = unknown>(events?: string | string[]): Array<RecordedEvent<T>> {
    let filter: Set<string> | null = null;
    if (events) {
      filter = new Set(Array.isArray(events) ? events : [events]);
    }

    const chronological = this.historyCount < this.maxHistory
      ? this.eventHistory.slice(0, this.historyCount)
      : [
          ...this.eventHistory.slice(this.historyCursor),
          ...this.eventHistory.slice(0, this.historyCursor),
        ];

    return chronological
      .filter((record) => (filter ? filter.has(record.event) : true))
      .map((record) => ({ ...record })) as Array<RecordedEvent<T>>;
  }

  rejections<T = unknown>(events?: string | string[]): Array<RejectedEvent<T>> {
    let filter: Set<string> | null = null;
    if (events) {
      filter = new Set(Array.isArray(events) ? events : [events]);
    }

    return this.rejectedHistory
      .filter((record) => (filter ? filter.has(record.event) : true))
      .map((record) => ({ ...record })) as Array<RejectedEvent<T>>;
  }

  clearHistory(): void {
    this.eventHistory.length = 0;
    this.rejectedHistory.length = 0;
    this.sequencer.reset();
    this.historyCursor = 0;
    this.historyCount = 0;
    this.lastAcceptedTimestampByScope.clear();
    this.processedIdempotency.clear();
    this.validators.clear();
  }

  private validateEnvelope<T>(envelope: EventEnvelope<T>): EventValidationResult {
    if (!Number.isInteger(envelope.sequence) || envelope.sequence <= 0) {
      return { valid: false, reason: 'invalid-sequence' };
    }
    if (!Number.isFinite(envelope.timestamp) || envelope.timestamp <= 0) {
      return { valid: false, reason: 'invalid-timestamp' };
    }
    if (!envelope.snapshotId || envelope.snapshotId.length === 0) {
      return { valid: false, reason: 'missing-snapshot-id' };
    }
    if (!envelope.source || envelope.source.length === 0) {
      return { valid: false, reason: 'missing-source' };
    }
    if (!envelope.lineageId || envelope.lineageId.length === 0) {
      return { valid: false, reason: 'missing-lineage-id' };
    }
    return { valid: true };
  }

  private recordRejected<T>(
    event: string,
    envelope: EventEnvelope<T>,
    rejectionReason: string,
    idempotencyKey?: string,
  ): void {
    const rejected: RejectedEvent = {
      sequence: envelope.sequence,
      event,
      payload: envelope.payload,
      timestamp: envelope.timestamp,
      snapshotId: envelope.snapshotId,
      source: envelope.source,
      lineageId: envelope.lineageId,
      idempotencyKey,
      rejectionReason,
    };

    this.rejectedHistory.push(rejected);
    if (this.rejectedHistory.length > this.maxRejectedHistory) {
      this.rejectedHistory.shift();
    }
  }

  private pruneIdempotency(nowMs: number): void {
    const cutoff = nowMs - this.idempotencyTtlMs;
    for (const [key, acceptedAt] of this.processedIdempotency.entries()) {
      if (acceptedAt < cutoff) {
        this.processedIdempotency.delete(key);
      }
    }
  }
}

function extractTimestamp(payload: unknown): number {
  if (payload && typeof payload === 'object' && 'timestamp' in payload) {
    const candidate = (payload as { timestamp?: unknown }).timestamp;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return Date.now();
}

function extractSnapshotId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if ('snapshot_id' in payload) {
    const value = (payload as { snapshot_id?: unknown }).snapshot_id;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  if ('snapshotId' in payload) {
    const value = (payload as { snapshotId?: unknown }).snapshotId;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}
