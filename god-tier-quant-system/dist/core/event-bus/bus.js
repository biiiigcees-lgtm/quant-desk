import { EventEmitter } from 'node:events';
export class EventBus {
    constructor(maxListeners = 200, maxHistory = 5000) {
        this.emitter = new EventEmitter();
        this.eventHistory = [];
        this.sequence = 0;
        this.historyCursor = 0;
        this.historyCount = 0;
        this.emitter.setMaxListeners(maxListeners);
        this.maxHistory = Math.max(100, maxHistory);
    }
    emit(event, payload) {
        const record = {
            sequence: ++this.sequence,
            event,
            payload,
            timestamp: Date.now(),
        };
        if (this.eventHistory.length < this.maxHistory) {
            this.eventHistory.push(record);
            this.historyCount += 1;
        }
        else {
            this.eventHistory[this.historyCursor] = record;
            this.historyCursor = (this.historyCursor + 1) % this.maxHistory;
            this.historyCount = this.maxHistory;
        }
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
    clearHistory() {
        this.eventHistory.length = 0;
        this.sequence = 0;
        this.historyCursor = 0;
        this.historyCount = 0;
    }
}
