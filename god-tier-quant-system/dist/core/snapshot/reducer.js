const MAX_METRICS = 100;
const ARRAY_FIELDS = new Set([
    'causalInsights',
    'aiOrchestrationMetrics',
    'aiOrchestrationFailures',
]);
export class SnapshotReducer {
    constructor(initial) {
        this.listeners = new Set();
        this.current = initial ?? SnapshotReducer.empty();
    }
    /** Returns the initial empty snapshot. */
    static empty() {
        return Object.freeze({
            snapshotId: 'snap-0-init',
            sequence: 0,
            timestamp: 0,
            causalInsights: Object.freeze([]),
            aiOrchestrationMetrics: Object.freeze([]),
            aiOrchestrationFailures: Object.freeze([]),
        });
    }
    /** Returns current frozen snapshot. */
    getSnapshot() {
        return this.current;
    }
    /**
     * Creates a new frozen snapshot with the updated field.
     * For array fields, prepends the new value and bounds to MAX_METRICS.
     */
    apply(field, value) {
        const seq = this.current.sequence + 1;
        const id = `snap-${seq}-${Date.now().toString(36)}`;
        const ts = Date.now();
        let updated;
        if (ARRAY_FIELDS.has(field)) {
            const existing = this.current[field];
            const entry = Object.freeze(value !== null && typeof value === 'object'
                ? value
                : { value });
            const next = [entry, ...existing];
            if (next.length > MAX_METRICS)
                next.length = MAX_METRICS;
            updated = Object.freeze(next);
        }
        else {
            updated =
                value !== null && typeof value === 'object'
                    ? Object.freeze(value)
                    : value;
        }
        const next = Object.freeze({
            ...this.current,
            snapshotId: id,
            sequence: seq,
            timestamp: ts,
            [field]: updated,
        });
        this.current = next;
        this.notifyListeners(next);
        return next;
    }
    /**
     * Subscribes a listener. Returns an unsubscribe function.
     * Listener errors are swallowed to protect the pipeline.
     */
    subscribe(fn) {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }
    /** Returns a JSON-serializable deep copy of the current snapshot. */
    toSerializable() {
        return JSON.parse(JSON.stringify(this.current));
    }
    notifyListeners(snap) {
        for (const fn of this.listeners) {
            try {
                fn(snap);
            }
            catch {
                // Never throw from listener errors
            }
        }
    }
}
