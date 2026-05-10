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
  private readonly maxHistory: number;
  private historyCursor = 0;
  private historyCount = 0;

  constructor(maxListeners: number = 200, maxHistory: number = 5000) {
    this.emitter.setMaxListeners(maxListeners);
    this.maxHistory = Math.max(100, maxHistory);
  }

  emit<T>(event: string, payload: T): boolean {
    const record: RecordedEvent = {
      sequence: ++this.sequence,
      event,
      payload,
      timestamp: Date.now(),
    };

    if (this.eventHistory.length < this.maxHistory) {
      this.eventHistory.push(record);
      this.historyCount += 1;
    } else {
      this.eventHistory[this.historyCursor] = record;
      this.historyCursor = (this.historyCursor + 1) % this.maxHistory;
      this.historyCount = this.maxHistory;
    }

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
    let filter: Set<string> | null = null;
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
      .map((record) => ({ ...record })) as Array<RecordedEvent<T>>;
  }

  clearHistory(): void {
    this.eventHistory.length = 0;
    this.sequence = 0;
    this.historyCursor = 0;
    this.historyCount = 0;
  }
}
