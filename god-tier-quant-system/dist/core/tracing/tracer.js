import { EVENTS } from '../event-bus/events.js';
export class Tracer {
    constructor(bus, service) {
        this.bus = bus;
        this.service = service;
    }
    startSpan(operation) {
        const now = Date.now();
        return {
            traceId: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
            spanId: `${Math.random().toString(36).slice(2, 10)}`,
            service: this.service,
            operation,
            startedAt: now,
        };
    }
    endSpan(span, tags) {
        const mergedTags = { service: span.service, operation: span.operation };
        if (tags) {
            Object.assign(mergedTags, tags);
        }
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'trace.span.duration.ms',
            value: Date.now() - span.startedAt,
            tags: mergedTags,
            timestamp: Date.now(),
        });
    }
}
