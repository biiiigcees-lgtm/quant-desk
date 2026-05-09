import { EventEmitter } from 'node:events';
export class EventBus {
    constructor(maxListeners = 200) {
        this.emitter = new EventEmitter();
        this.eventHistory = [];
        this.sequence = 0;
        this.emitter.setMaxListeners(maxListeners);
    }
    emit(event, payload) {
        this.eventHistory.push({
            sequence: ++this.sequence,
            event,
            payload,
            timestamp: Date.now(),
        });
        return this.emitter.emit(event, payload);
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
        const filter = events ? new Set(Array.isArray(events) ? events : [events]) : null;
        return this.eventHistory
            .filter((record) => (filter ? filter.has(record.event) : true))
            .map((record) => ({ ...record }));
    }
    clearHistory() {
        this.eventHistory.length = 0;
        this.sequence = 0;
    }
}
