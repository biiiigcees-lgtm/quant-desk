import { EVENTS } from '../../core/event-bus/events.js';
export class AiMemoryService {
    constructor(bus, maxEntries = 1000) {
        this.bus = bus;
        this.memory = new Map();
        this.maxEntries = Math.max(100, maxEntries);
    }
    start() {
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const key = `${event.contractId}:drift`;
            const value = `psi=${event.psi.toFixed(4)},kl=${event.kl.toFixed(4)},severity=${event.severity}`;
            this.memory.set(key, { value, timestamp: event.timestamp });
            this.prune(event.timestamp);
            let confidence;
            if (event.severity === 'high') {
                confidence = 0.92;
            }
            else if (event.severity === 'medium') {
                confidence = 0.72;
            }
            else {
                confidence = 0.55;
            }
            const payload = {
                key,
                value,
                confidence,
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.AI_MEMORY_WRITE, payload);
            this.bus.emit(EVENTS.TELEMETRY, {
                name: 'ai.memory.writes',
                value: 1,
                tags: { severity: event.severity, size: String(this.memory.size) },
                timestamp: event.timestamp,
            });
        });
    }
    prune(now) {
        if (this.memory.size <= this.maxEntries) {
            return;
        }
        const entries = [...this.memory.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
        const overflow = this.memory.size - this.maxEntries;
        for (let i = 0; i < overflow; i += 1) {
            const key = entries[i]?.[0];
            if (key) {
                this.memory.delete(key);
            }
        }
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'ai.memory.pruned',
            value: overflow,
            tags: { size: String(this.memory.size) },
            timestamp: now,
        });
    }
}
