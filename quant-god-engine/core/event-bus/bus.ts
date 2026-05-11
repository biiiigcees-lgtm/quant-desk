import { EventEmitter } from 'node:events';

export type Listener<T = unknown> = (event: T) => void | Promise<void>;

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor(maxListeners: number = 200) {
    this.emitter.setMaxListeners(maxListeners);
  }

  emit<T>(event: string, payload: T): boolean {
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
}
