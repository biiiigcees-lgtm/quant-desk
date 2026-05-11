import { EventBus } from '../event-bus/bus.js';
import { EVENTS } from '../event-bus/events.js';

export interface TraceSpan {
  traceId: string;
  spanId: string;
  service: string;
  operation: string;
  startedAt: number;
}

export class Tracer {
  constructor(private readonly bus: EventBus, private readonly service: string) {}

  startSpan(operation: string): TraceSpan {
    const now = Date.now();
    return {
      traceId: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      spanId: `${Math.random().toString(36).slice(2, 10)}`,
      service: this.service,
      operation,
      startedAt: now,
    };
  }

  endSpan(span: TraceSpan, tags?: Record<string, string>): void {
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
