import { EVENTS } from '../../core/event-bus/events.js';
import { createHash } from 'node:crypto';
export class ReplayEngine {
    constructor(bus) {
        this.bus = bus;
        this.records = [];
    }
    start() {
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
            this.bus.on(name, (payload) => {
                this.records.push({ event: name, payload, timestamp: Date.now() });
            });
        }
    }
    replay(targetBus) {
        for (const record of this.records) {
            targetBus.emit(EVENTS.REPLAY_EVENT, record);
            targetBus.emit(record.event, record.payload);
        }
    }
    getRecords() {
        return [...this.records];
    }
    checksum() {
        const hash = createHash('sha256');
        for (const record of this.records) {
            hash.update(JSON.stringify(record));
            hash.update('\n');
        }
        return hash.digest('hex');
    }
}
