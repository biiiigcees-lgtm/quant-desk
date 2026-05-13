import { EVENTS } from '../../core/event-bus/events.js';
export class PersistentEventLog {
    constructor(bus, storage, options = {}) {
        this.bus = bus;
        this.storage = storage;
        this.listeners = new Map();
        this.hydrating = false;
        this.persistedEvents = options.persistedEvents ?? DEFAULT_PERSISTED_EVENTS;
    }
    async hydrateBus() {
        this.hydrating = true;
        try {
            return await this.storage.replay((record) => {
                this.bus.emit(record.event, record.payload, {
                    timestamp: record.timestamp,
                    snapshotId: record.snapshotId,
                    source: record.source ?? record.event,
                    idempotencyKey: record.idempotencyKey,
                });
            });
        }
        finally {
            this.hydrating = false;
        }
    }
    start() {
        for (const event of this.persistedEvents) {
            if (this.listeners.has(event)) {
                continue;
            }
            const listener = (payload) => {
                if (this.hydrating) {
                    return;
                }
                this.storage.append(event, payload, {
                    contractId: extractContractId(payload),
                    snapshotId: extractSnapshotId(payload),
                    source: extractSource(payload) ?? event,
                    idempotencyKey: extractIdempotencyKey(payload),
                    timestamp: extractTimestamp(payload),
                });
            };
            this.listeners.set(event, listener);
            this.bus.on(event, listener);
        }
    }
    stop() {
        for (const [event, listener] of this.listeners.entries()) {
            this.bus.off(event, listener);
        }
        this.listeners.clear();
    }
}
const DEFAULT_PERSISTED_EVENTS = Object.values(EVENTS).filter((event) => event !== EVENTS.REPLAY_EVENT && event !== EVENTS.TELEMETRY);
function extractContractId(payload) {
    if (payload && typeof payload === 'object' && 'contractId' in payload) {
        const value = payload.contractId;
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return undefined;
}
function extractSnapshotId(payload) {
    if (payload && typeof payload === 'object' && 'snapshotId' in payload) {
        const value = payload.snapshotId;
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return undefined;
}
function extractSource(payload) {
    if (payload && typeof payload === 'object' && 'source' in payload) {
        const value = payload.source;
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return undefined;
}
function extractIdempotencyKey(payload) {
    if (payload && typeof payload === 'object' && 'idempotencyKey' in payload) {
        const value = payload.idempotencyKey;
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return undefined;
}
function extractTimestamp(payload) {
    if (payload && typeof payload === 'object' && 'timestamp' in payload) {
        const value = payload.timestamp;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return undefined;
}
