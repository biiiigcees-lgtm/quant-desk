import { EventEmitter } from 'node:events';
import { EventSequencer } from '../determinism/sequencer.js';
import { MonotonicLogicalClock } from '../determinism/logical-clock.js';
import { EVENTS } from './events.js';
export class EventBus {
    constructor(maxListeners = 200, maxHistory = 5000, idempotencyTtlMs = 5 * 60 * 1000, clock = new MonotonicLogicalClock()) {
        this.emitter = new EventEmitter();
        this.eventHistory = [];
        this.rejectedHistory = [];
        this.sequencer = new EventSequencer();
        this.validators = new Map();
        this.lastAcceptedTimestampByScope = new Map();
        this.processedIdempotency = new Map();
        this.historyCursor = 0;
        this.historyCount = 0;
        this.emitter.setMaxListeners(maxListeners);
        this.maxHistory = Math.max(100, maxHistory);
        this.maxRejectedHistory = Math.max(100, Math.floor(this.maxHistory / 2));
        this.idempotencyTtlMs = Math.max(1000, idempotencyTtlMs);
        this.clock = clock;
    }
    emit(event, payload, metadata) {
        const timestamp = resolveTimestamp(payload, metadata, this.clock);
        if (timestamp === null && REQUIRES_EXPLICIT_TIMESTAMP.has(event)) {
            this.rejectMissingExplicitTimestamp(event, payload, metadata);
            return false;
        }
        const resolvedTimestamp = timestamp ?? this.clock.tick();
        const snapshotId = metadata?.snapshotId ?? extractSnapshotId(payload) ?? 'na';
        const source = metadata?.source ?? event;
        const idempotencyKey = metadata?.idempotencyKey;
        const envelope = this.sequencer.wrap(payload, snapshotId, source, resolvedTimestamp);
        if (this.rejectIfInvalidEnvelope(event, envelope, idempotencyKey)) {
            return false;
        }
        if (this.rejectIfCustomValidatorFails(event, envelope, idempotencyKey)) {
            return false;
        }
        if (!this.acceptIdempotency(event, envelope, idempotencyKey, resolvedTimestamp)) {
            return false;
        }
        if (!this.acceptOrdering(event, source, resolvedTimestamp, metadata, envelope, idempotencyKey)) {
            return false;
        }
        this.appendHistory({
            sequence: envelope.sequence,
            event,
            payload,
            timestamp: resolvedTimestamp,
            snapshotId,
            source,
            lineageId: envelope.lineageId,
            idempotencyKey,
        });
        return this.emitter.emit(event, payload);
    }
    registerValidator(event, validator) {
        this.validators.set(event, validator);
    }
    unregisterValidator(event) {
        this.validators.delete(event);
    }
    on(event, listener) {
        this.emitter.on(event, listener);
    }
    off(event, listener) {
        this.emitter.off(event, listener);
    }
    once(event, listener) {
        this.emitter.once(event, listener);
    }
    history(events) {
        let filter = null;
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
            .map((record) => ({ ...record }));
    }
    rejections(events) {
        let filter = null;
        if (events) {
            filter = new Set(Array.isArray(events) ? events : [events]);
        }
        return this.rejectedHistory
            .filter((record) => (filter ? filter.has(record.event) : true))
            .map((record) => ({ ...record }));
    }
    clearHistory() {
        this.eventHistory.length = 0;
        this.rejectedHistory.length = 0;
        this.sequencer.reset();
        this.historyCursor = 0;
        this.historyCount = 0;
        this.lastAcceptedTimestampByScope.clear();
        this.processedIdempotency.clear();
        this.validators.clear();
    }
    validateEnvelope(envelope) {
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
    recordRejected(event, envelope, rejectionReason, idempotencyKey) {
        const rejected = {
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
    rejectMissingExplicitTimestamp(event, payload, metadata) {
        const envelope = this.sequencer.wrap(payload, metadata?.snapshotId ?? 'na', metadata?.source ?? event, 0);
        this.recordRejected(event, envelope, 'missing-explicit-timestamp', metadata?.idempotencyKey);
    }
    rejectIfInvalidEnvelope(event, envelope, idempotencyKey) {
        if (!this.sequencer.validateMonotonic(envelope)) {
            this.recordRejected(event, envelope, 'non-monotonic-sequence', idempotencyKey);
            return true;
        }
        const builtInValidation = this.validateEnvelope(envelope);
        if (!builtInValidation.valid) {
            this.recordRejected(event, envelope, builtInValidation.reason ?? 'invalid-envelope', idempotencyKey);
            return true;
        }
        return false;
    }
    rejectIfCustomValidatorFails(event, envelope, idempotencyKey) {
        const customValidator = this.validators.get(event);
        if (!customValidator) {
            return false;
        }
        const customValidation = customValidator(envelope);
        if (customValidation.valid) {
            return false;
        }
        this.recordRejected(event, envelope, customValidation.reason ?? 'validator-rejected', idempotencyKey);
        return true;
    }
    acceptIdempotency(event, envelope, idempotencyKey, resolvedTimestamp) {
        if (!idempotencyKey) {
            return true;
        }
        this.pruneIdempotency(resolvedTimestamp);
        if (this.processedIdempotency.has(idempotencyKey)) {
            this.recordRejected(event, envelope, 'duplicate-idempotency-key', idempotencyKey);
            return false;
        }
        this.processedIdempotency.set(idempotencyKey, resolvedTimestamp);
        return true;
    }
    acceptOrdering(event, source, resolvedTimestamp, metadata, envelope, idempotencyKey) {
        const enforceStaleOrdering = metadata?.source !== undefined || metadata?.snapshotId !== undefined;
        if (!enforceStaleOrdering) {
            return true;
        }
        const staleScope = `${event}:${source}`;
        const previousTimestamp = this.lastAcceptedTimestampByScope.get(staleScope);
        if (previousTimestamp !== undefined && resolvedTimestamp < previousTimestamp) {
            this.recordRejected(event, envelope, 'stale-event', idempotencyKey);
            return false;
        }
        this.lastAcceptedTimestampByScope.set(staleScope, resolvedTimestamp);
        return true;
    }
    appendHistory(record) {
        if (this.eventHistory.length < this.maxHistory) {
            this.eventHistory.push(record);
            this.historyCount += 1;
            return;
        }
        this.eventHistory[this.historyCursor] = record;
        this.historyCursor = (this.historyCursor + 1) % this.maxHistory;
        this.historyCount = this.maxHistory;
    }
    pruneIdempotency(nowMs) {
        const cutoff = nowMs - this.idempotencyTtlMs;
        for (const [key, acceptedAt] of this.processedIdempotency.entries()) {
            if (acceptedAt < cutoff) {
                this.processedIdempotency.delete(key);
            }
        }
    }
}
function extractTimestamp(payload) {
    if (payload && typeof payload === 'object' && 'timestamp' in payload) {
        const candidate = payload.timestamp;
        if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
            return candidate;
        }
    }
    return Number.NaN;
}
function resolveTimestamp(payload, metadata, _clock) {
    if (metadata && Number.isFinite(metadata.timestamp) && Number(metadata.timestamp) > 0) {
        return Number(metadata.timestamp);
    }
    const extracted = extractTimestamp(payload);
    if (Number.isFinite(extracted) && extracted > 0) {
        return extracted;
    }
    return null;
}
function extractSnapshotId(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    if ('snapshot_id' in payload) {
        const value = payload.snapshot_id;
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    if ('snapshotId' in payload) {
        const value = payload.snapshotId;
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return null;
}
const REQUIRES_EXPLICIT_TIMESTAMP = new Set([
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
