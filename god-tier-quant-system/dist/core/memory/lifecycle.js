export class MemoryLifecycleManager {
    constructor() {
        this.registrations = new Map();
        this.timer = null;
        this.pruneCount = 0;
        this.lastPruneAt = null;
    }
    register(name, fn) {
        this.registrations.set(name, fn);
        return () => {
            this.registrations.delete(name);
        };
    }
    prune() {
        this.pruneCount++;
        this.lastPruneAt = Date.now();
        for (const [, fn] of this.registrations) {
            try {
                fn();
            }
            catch {
                // prune errors must never crash the manager
            }
        }
    }
    start(intervalMs = 5 * 60 * 1000) {
        if (this.timer !== null)
            return;
        this.timer = setInterval(() => {
            this.prune();
        }, intervalMs);
    }
    stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    stats() {
        return {
            registrations: this.registrations.size,
            pruneCount: this.pruneCount,
            lastPruneAt: this.lastPruneAt,
        };
    }
}
