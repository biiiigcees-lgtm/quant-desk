import { EVENTS } from '../../core/event-bus/events.js';
export class AiMemoryService {
    constructor(bus) {
        this.bus = bus;
        this.memory = new Map();
    }
    start() {
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const key = `${event.contractId}:drift`;
            const value = `psi=${event.psi.toFixed(4)},kl=${event.kl.toFixed(4)},severity=${event.severity}`;
            this.memory.set(key, value);
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
                tags: { severity: event.severity },
                timestamp: event.timestamp,
            });
        });
    }
}
