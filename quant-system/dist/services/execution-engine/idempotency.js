export class IdempotencyGuard {
    constructor() {
        this.seenKeys = new Set();
    }
    checkAndSet(key) {
        if (this.seenKeys.has(key)) {
            return false;
        }
        this.seenKeys.add(key);
        return true;
    }
    clearOlderThan(_ms) {
        // Simple in-memory implementation; can be replaced with timed map later.
    }
}
