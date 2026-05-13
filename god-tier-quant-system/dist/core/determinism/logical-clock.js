export class MonotonicLogicalClock {
    constructor(seed = 1) {
        this.current = Math.max(1, Math.floor(seed));
    }
    now() {
        return this.current;
    }
    observe(timestamp) {
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
            return this.tick();
        }
        const next = Math.max(this.current + 1, Math.floor(timestamp));
        this.current = next;
        return this.current;
    }
    tick(step = 1) {
        const delta = Number.isFinite(step) ? Math.max(1, Math.floor(step)) : 1;
        this.current += delta;
        return this.current;
    }
}
