import { EventEmitter } from 'node:events';
import { EventEnvelope, EventSequencer } from '../determinism/sequencer.js';
import { LogicalClock, MonotonicLogicalClock } from '../determinism/logical-clock.js';
import { EVENTS } from './events.js';

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

export interface EventBusOrderingOptions {
  maxOutOfOrderMs?: number;
  maxBufferedPerScope?: number;
}

export interface RecordedEvent<T = unknown> {
  sequence: number;
  event: string;
  payload: T;
  sourceTimestamp: number;
  receiveTimestamp: number;
  timestamp: number;
  snapshotId: string;
  source: string;
  lineageId: string;
  idempotencyKey?: string;
}

export interface RejectedEvent<T = unknown> extends RecordedEvent<T> {
  rejectionReason: string;
}

interface BufferedEvent<T = unknown> {
  event: string;
  payload: T;
  sourceTimestamp: number;
  receiveTimestamp: number;
  snapshotId: string;
  source: string;
  idempotencyKey?: string;
  scope: string;
}

interface RejectionInput<T> {
  event: string;
  payload: T;
  snapshotId: string;
  source: string;
  sourceTimestamp: number;
  receiveTimestamp: number;
  rejectionReason: string;
  idempotencyKey?: string;
  envelope?: EventEnvelope<T>;
}

export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly eventHistory: RecordedEvent[] = [];
  private readonly rejectedHistory: RejectedEvent[] = [];
  private readonly sequencer = new EventSequencer();
  private readonly validators = new Map<string, EventValidator<unknown>>();
  private readonly lastAcceptedTimestampByScope = new Map<string, number>();
  private readonly processedIdempotency = new Map<string, number>();
  private readonly bufferedByScope = new Map<string, BufferedEvent[]>();
  private readonly maxHistory: number;
  private historyCursor = 0;
  private historyCount = 0;
  private readonly maxRejectedHistory: number;
  private readonly idempotencyTtlMs: number;
  private readonly clock: LogicalClock;
  private readonly maxOutOfOrderMs: number;
  private readonly maxBufferedPerScope: number;

  constructor(
    maxListeners: number = 200,
    maxHistory: number = 5000,
    idempotencyTtlMs: number = 5 * 60 * 1000,
    clock: LogicalClock = new MonotonicLogicalClock(),
    orderingOptions: EventBusOrderingOptions = {},
  ) {
    this.emitter.setMaxListeners(maxListeners);
    this.maxHistory = Math.max(100, maxHistory);
    this.maxRejectedHistory = Math.max(100, Math.floor(this.maxHistory / 2));
    this.idempotencyTtlMs = Math.max(1_000, idempotencyTtlMs);
    this.clock = clock;
    this.maxOutOfOrderMs = Math.max(0, orderingOptions.maxOutOfOrderMs ?? 2_000);
    this.maxBufferedPerScope = Math.max(1, orderingOptions.maxBufferedPerScope ?? 256);
  }

  emit<T>(event: string, payload: T, metadata?: EmitMetadata): boolean {
    const receiveTimestamp = this.clock.tick();
    const timestamp = resolveTimestamp(payload, metadata, this.clock);
    if (timestamp === null && REQUIRES_EXPLICIT_TIMESTAMP.has(event)) {
      this.rejectMissingExplicitTimestamp(event, payload, metadata, receiveTimestamp);
      return false;
    }

    const resolvedTimestamp = timestamp ?? this.clock.tick();
    const snapshotId = metadata?.snapshotId ?? extractSnapshotId(payload) ?? 'na';
    const source = metadata?.source ?? event;
    const idempotencyKey = metadata?.idempotencyKey;
    const scope = `${event}:${source}`;

    const candidate: BufferedEvent<T> = {
      event,
      payload,
      sourceTimestamp: resolvedTimestamp,
      receiveTimestamp,
      snapshotId,
      source,
      idempotencyKey,
      scope,
    };

    const orderingResult = this.acceptOrdering(event, scope, resolvedTimestamp, metadata, candidate);
    if (orderingResult === 'reject') {
      return false;
    }

    if (orderingResult === 'buffered') {
      return true;
    }

    const accepted = this.finalizeAccepted(candidate, true);
    if (accepted) {
      this.flushBufferedForScope(scope);
    }
    return accepted;
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
    this.bufferedByScope.clear();
    this.validators.clear();
  }

  flushAllBuffered(): number {
    let flushed = 0;
    for (const scope of this.bufferedByScope.keys()) {
      flushed += this.flushBufferedForScope(scope);
    }
    return flushed;
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

  private recordRejected<T>(input: RejectionInput<T>): void {
    const sequence = input.envelope?.sequence ?? this.sequencer.peekNextSequence();
    const rejected: RejectedEvent = {
      sequence,
      event: input.event,
      payload: input.payload,
      sourceTimestamp: input.sourceTimestamp,
      receiveTimestamp: input.receiveTimestamp,
      timestamp: input.sourceTimestamp,
      snapshotId: input.snapshotId,
      source: input.source,
      lineageId: input.envelope?.lineageId ?? `${input.source}:${input.snapshotId}:rejected:${sequence}`,
      idempotencyKey: input.idempotencyKey,
      rejectionReason: input.rejectionReason,
    };

    this.rejectedHistory.push(rejected);
    if (this.rejectedHistory.length > this.maxRejectedHistory) {
      this.rejectedHistory.shift();
    }
  }

  private rejectMissingExplicitTimestamp<T>(event: string, payload: T, metadata: EmitMetadata | undefined, receiveTimestamp: number): void {
    this.recordRejected({
      event,
      payload,
      snapshotId: metadata?.snapshotId ?? 'na',
      source: metadata?.source ?? event,
      sourceTimestamp: 0,
      receiveTimestamp,
      rejectionReason: 'missing-explicit-timestamp',
      idempotencyKey: metadata?.idempotencyKey,
    });
  }

  private rejectIfInvalidEnvelope<T>(
    event: string,
    envelope: EventEnvelope<T>,
    receiveTimestamp: number,
    idempotencyKey?: string,
  ): boolean {
    if (!this.sequencer.validateMonotonic(envelope)) {
      this.recordRejected({
        event,
        payload: envelope.payload,
        snapshotId: envelope.snapshotId,
        source: envelope.source,
        sourceTimestamp: envelope.timestamp,
        receiveTimestamp,
        rejectionReason: 'non-monotonic-sequence',
        idempotencyKey,
        envelope,
      });
      return true;
    }

    const builtInValidation = this.validateEnvelope(envelope);
    if (!builtInValidation.valid) {
      this.recordRejected({
        event,
        payload: envelope.payload,
        snapshotId: envelope.snapshotId,
        source: envelope.source,
        sourceTimestamp: envelope.timestamp,
        receiveTimestamp,
        rejectionReason: builtInValidation.reason ?? 'invalid-envelope',
        idempotencyKey,
        envelope,
      });
      return true;
    }

    return false;
  }

  private rejectIfCustomValidatorFails<T>(
    event: string,
    envelope: EventEnvelope<T>,
    receiveTimestamp: number,
    idempotencyKey?: string,
  ): boolean {
    const customValidator = this.validators.get(event) as EventValidator<T> | undefined;
    if (!customValidator) {
      return false;
    }

    const customValidation = customValidator(envelope);
    if (customValidation.valid) {
      return false;
    }

    this.recordRejected({
      event,
      payload: envelope.payload,
      snapshotId: envelope.snapshotId,
      source: envelope.source,
      sourceTimestamp: envelope.timestamp,
      receiveTimestamp,
      rejectionReason: customValidation.reason ?? 'validator-rejected',
      idempotencyKey,
      envelope,
    });
    return true;
  }

  private acceptIdempotency<T>(
    event: string,
    candidate: BufferedEvent<T>,
  ): boolean {
    if (!candidate.idempotencyKey) {
      return true;
    }

    this.pruneIdempotency(candidate.sourceTimestamp);
    if (this.processedIdempotency.has(candidate.idempotencyKey)) {
      this.recordRejected({
        event,
        payload: candidate.payload,
        snapshotId: candidate.snapshotId,
        source: candidate.source,
        sourceTimestamp: candidate.sourceTimestamp,
        receiveTimestamp: candidate.receiveTimestamp,
        rejectionReason: 'duplicate-idempotency-key',
        idempotencyKey: candidate.idempotencyKey,
      });
      return false;
    }

    this.processedIdempotency.set(candidate.idempotencyKey, candidate.sourceTimestamp);
    return true;
  }

  private acceptOrdering<T>(
    event: string,
    scope: string,
    resolvedTimestamp: number,
    metadata: EmitMetadata | undefined,
    candidate: BufferedEvent<T>,
  ): 'ready' | 'buffered' | 'reject' {
    const enforceStaleOrdering = metadata?.source !== undefined || metadata?.snapshotId !== undefined;
    if (!enforceStaleOrdering) {
      return 'ready';
    }

    const previousTimestamp = this.lastAcceptedTimestampByScope.get(scope);
    if (previousTimestamp === undefined || resolvedTimestamp >= previousTimestamp) {
      return 'ready';
    }

    if (resolvedTimestamp + this.maxOutOfOrderMs < previousTimestamp) {
      this.recordRejected({
        event,
        payload: candidate.payload,
        snapshotId: candidate.snapshotId,
        source: candidate.source,
        sourceTimestamp: candidate.sourceTimestamp,
        receiveTimestamp: candidate.receiveTimestamp,
        rejectionReason: 'stale-event',
        idempotencyKey: candidate.idempotencyKey,
      });
      return 'reject';
    }

    const queue = this.bufferedByScope.get(scope) ?? [];
    if (queue.length >= this.maxBufferedPerScope) {
      this.recordRejected({
        event,
        payload: candidate.payload,
        snapshotId: candidate.snapshotId,
        source: candidate.source,
        sourceTimestamp: candidate.sourceTimestamp,
        receiveTimestamp: candidate.receiveTimestamp,
        rejectionReason: 'out-of-order-buffer-overflow',
        idempotencyKey: candidate.idempotencyKey,
      });
      return 'reject';
    }

    queue.push(candidate);
    this.bufferedByScope.set(scope, queue);
    return 'buffered';
  }

  private finalizeAccepted<T>(candidate: BufferedEvent<T>, updateWatermark: boolean): boolean {
    const envelope = this.sequencer.wrap(candidate.payload, candidate.snapshotId, candidate.source, candidate.sourceTimestamp);

    if (this.rejectIfInvalidEnvelope(candidate.event, envelope, candidate.receiveTimestamp, candidate.idempotencyKey)) {
      return false;
    }

    if (this.rejectIfCustomValidatorFails(candidate.event, envelope, candidate.receiveTimestamp, candidate.idempotencyKey)) {
      return false;
    }

    if (!this.acceptIdempotency(candidate.event, candidate)) {
      return false;
    }

    this.appendHistory({
      sequence: envelope.sequence,
      event: candidate.event,
      payload: candidate.payload,
      sourceTimestamp: candidate.sourceTimestamp,
      receiveTimestamp: candidate.receiveTimestamp,
      timestamp: candidate.sourceTimestamp,
      snapshotId: candidate.snapshotId,
      source: candidate.source,
      lineageId: envelope.lineageId,
      idempotencyKey: candidate.idempotencyKey,
    });

    if (updateWatermark) {
      const current = this.lastAcceptedTimestampByScope.get(candidate.scope) ?? Number.NEGATIVE_INFINITY;
      this.lastAcceptedTimestampByScope.set(candidate.scope, Math.max(current, candidate.sourceTimestamp));
    }

    this.emitter.emit(candidate.event, candidate.payload);
    return true;
  }

  private flushBufferedForScope(scope: string): number {
    const queue = this.bufferedByScope.get(scope);
    if (!queue || queue.length === 0) {
      return 0;
    }

    queue.sort(compareBufferedEvents);
    let flushed = 0;
    const watermark = this.lastAcceptedTimestampByScope.get(scope) ?? Number.NEGATIVE_INFINITY;
    const remaining: BufferedEvent[] = [];

    for (const entry of queue) {
      if (watermark - entry.sourceTimestamp > this.maxOutOfOrderMs) {
        this.recordRejected({
          event: entry.event,
          payload: entry.payload,
          snapshotId: entry.snapshotId,
          source: entry.source,
          sourceTimestamp: entry.sourceTimestamp,
          receiveTimestamp: entry.receiveTimestamp,
          rejectionReason: 'stale-event',
          idempotencyKey: entry.idempotencyKey,
        });
        continue;
      }

      if (this.finalizeAccepted(entry, false)) {
        flushed += 1;
      } else {
        remaining.push(entry);
      }
    }

    if (remaining.length > 0) {
      this.bufferedByScope.set(scope, remaining);
    } else {
      this.bufferedByScope.delete(scope);
    }

    return flushed;
  }

  private appendHistory(record: RecordedEvent): void {
    if (this.eventHistory.length < this.maxHistory) {
      this.eventHistory.push(record);
      this.historyCount += 1;
      return;
    }

    this.eventHistory[this.historyCursor] = record;
    this.historyCursor = (this.historyCursor + 1) % this.maxHistory;
    this.historyCount = this.maxHistory;
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

function compareBufferedEvents(a: BufferedEvent, b: BufferedEvent): number {
  if (a.sourceTimestamp !== b.sourceTimestamp) {
    return a.sourceTimestamp - b.sourceTimestamp;
  }
  return a.receiveTimestamp - b.receiveTimestamp;
}

function extractTimestamp(payload: unknown): number {
  if (payload && typeof payload === 'object' && 'timestamp' in payload) {
    const candidate = (payload as { timestamp?: unknown }).timestamp;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return Number.NaN;
}

function resolveTimestamp(payload: unknown, metadata: EmitMetadata | undefined, _clock: LogicalClock): number | null {
  if (metadata && Number.isFinite(metadata.timestamp) && Number(metadata.timestamp) > 0) {
    return Number(metadata.timestamp);
  }

  const extracted = extractTimestamp(payload);
  if (Number.isFinite(extracted) && extracted > 0) {
    return extracted;
  }

  return null;
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

const REQUIRES_EXPLICIT_TIMESTAMP = new Set<string>([
  EVENTS.MARKET_DATA,
  EVENTS.MARKET_DATA_INTEGRITY,
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
  EVENTS.ORDER_EVENT,
  EVENTS.PORTFOLIO_UPDATE,
  EVENTS.VALIDATION_RESULT,
  EVENTS.DECISION_SNAPSHOT,
  EVENTS.DECISION_SNAPSHOT_INVALID,
  EVENTS.AI_AGENT_REQUEST,
  EVENTS.AI_AGENT_RESPONSE,
  EVENTS.AI_AGENT_FAILURE,
  EVENTS.AI_ROUTING_DECISION,
  EVENTS.AI_AGGREGATED_INTELLIGENCE,
  EVENTS.CONSTITUTIONAL_DECISION,
  EVENTS.REPLAY_INTEGRITY,
  EVENTS.CAUSAL_INSIGHT,
  EVENTS.MARKET_CAUSAL_STATE,
  EVENTS.MARKET_PHYSICS,
  EVENTS.SCENARIO_BRANCH_STATE,
  EVENTS.CROSS_MARKET_CAUSAL_STATE,
  EVENTS.MARKET_WORLD_STATE,
  EVENTS.EPISTEMIC_MEMORY_REVISION,
  EVENTS.SELF_IMPROVEMENT,
  EVENTS.MARKET_EXPERIENCE,
  EVENTS.META_CALIBRATION,
  EVENTS.OPERATOR_ATTENTION,
]);
