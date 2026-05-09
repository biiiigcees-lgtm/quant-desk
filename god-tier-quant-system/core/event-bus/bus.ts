import { EventEmitter } from 'node:events';

export type Listener<T = unknown> = (event: T) => void | Promise<void>;

export interface RecordedEvent<T = unknown> {
  sequence: number;
  event: string;
  payload: T;
  timestamp: number;
}

export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly eventHistory: RecordedEvent[] = [];
  private sequence = 0;

  constructor(maxListeners: number = 200) {
    this.emitter.setMaxListeners(maxListeners);
  }

  emit<T>(event: string, payload: T): boolean {
    this.eventHistory.push({
      sequence: ++this.sequence,
      event,
      payload,
      timestamp: Date.now(),
    });
    return this.emitter.emit(event, payload);
  }

  on<T>(event: string, listener: Listener<T>): void {
    this.emitter.on(event, listener);
  }

  off<T>(event: string, listener: Listener<T>): void {
    this.emitter.off(event, listener);
  }

  once<T>(event: string, listener: Listener<T>): void {
    this.emitter.once(event, listener);
  }

  history<T = unknown>(events?: string | string[]): Array<RecordedEvent<T>> {
    const filter = events ? new Set(Array.isArray(events) ? events : [events]) : null;
    return this.eventHistory
      .filter((record) => (filter ? filter.has(record.event) : true))
      .map((record) => ({ ...record })) as Array<RecordedEvent<T>>;
  }

  clearHistory(): void {
    this.eventHistory.length = 0;
    this.sequence = 0;
  }
}
