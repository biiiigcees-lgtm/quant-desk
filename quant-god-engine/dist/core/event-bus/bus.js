import { EventEmitter } from 'node:events';
export class EventBus {
    constructor(maxListeners = 200) {
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(maxListeners);
    }
    emit(event, payload) {
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
}
