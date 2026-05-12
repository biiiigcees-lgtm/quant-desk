import { EVENTS } from '../../core/event-bus/events.js';
import { createHash } from 'node:crypto';
export class ReplayEngine {
    constructor(bus) {
        this.bus = bus;
        this.tracked = [
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
    }
    start() {
        this.bus.history(this.tracked);
    }
    replay(targetBus) {
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
    getRecords() {
        return this.bus.history(this.tracked).map((record) => ({
            sequence: record.sequence,
            event: record.event,
            payload: record.payload,
            timestamp: record.timestamp,
            snapshotId: record.snapshotId,
            source: record.source,
            lineageId: record.lineageId,
            idempotencyKey: record.idempotencyKey,
        }));
    }
    checksum() {
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
function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const obj = value;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
    return `{${entries.join(',')}}`;
}
