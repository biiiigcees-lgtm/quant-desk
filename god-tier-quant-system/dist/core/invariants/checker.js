// ---------------------------------------------------------------------------
// Built-in core invariants
// ---------------------------------------------------------------------------
const SEQUENCE_NON_NEGATIVE = (snap) => {
    if (snap.sequence < 0) {
        return {
            invariant: 'SEQUENCE_NON_NEGATIVE',
            snapshotId: snap.snapshotId,
            details: `sequence ${snap.sequence} is negative`,
            severity: 'critical',
            timestamp: Date.now(),
        };
    }
    return null;
};
const SNAPSHOT_ID_NON_EMPTY = (snap) => {
    if (!snap.snapshotId || snap.snapshotId.length === 0) {
        return {
            invariant: 'SNAPSHOT_ID_NON_EMPTY',
            snapshotId: '(empty)',
            details: 'snapshotId is empty or missing',
            severity: 'critical',
            timestamp: Date.now(),
        };
    }
    return null;
};
const PROBABILITY_IN_RANGE = (snap) => {
    if (!snap.probability)
        return null;
    const est = snap.probability['estimatedProbability'];
    if (est === undefined)
        return null;
    if (typeof est !== 'number' || !Number.isFinite(est) || est < 0 || est > 1) {
        return {
            invariant: 'PROBABILITY_IN_RANGE',
            snapshotId: snap.snapshotId,
            details: `estimatedProbability=${JSON.stringify(est)} is not in [0,1]`,
            severity: 'critical',
            timestamp: Date.now(),
        };
    }
    return null;
};
const CONFIDENCE_INTERVAL_ORDERED = (snap) => {
    if (!snap.probability)
        return null;
    const ci = snap.probability['confidenceInterval'];
    if (!Array.isArray(ci) || ci.length < 2)
        return null;
    const [lo, hi] = ci;
    if (typeof lo === 'number' && typeof hi === 'number' && lo > hi) {
        return {
            invariant: 'CONFIDENCE_INTERVAL_ORDERED',
            snapshotId: snap.snapshotId,
            details: `CI lower=${lo} > upper=${hi}`,
            severity: 'warning',
            timestamp: Date.now(),
        };
    }
    return null;
};
const EPISTEMIC_HEALTH_SCORE_VALID = (snap) => {
    if (!snap.epistemicHealth)
        return null;
    const score = snap.epistemicHealth['epistemicHealthScore'];
    if (score === undefined)
        return null;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
        return {
            invariant: 'EPISTEMIC_HEALTH_SCORE_VALID',
            snapshotId: snap.snapshotId,
            details: `epistemicHealthScore=${JSON.stringify(score)} is not in [0,1]`,
            severity: 'warning',
            timestamp: Date.now(),
        };
    }
    return null;
};
const ARRAY_FIELDS_BOUNDED = (snap) => {
    const MAX = 100;
    for (const field of ['aiOrchestrationMetrics', 'aiOrchestrationFailures', 'causalInsights']) {
        const arr = snap[field];
        if (arr.length > MAX) {
            return {
                invariant: 'ARRAY_FIELDS_BOUNDED',
                snapshotId: snap.snapshotId,
                details: `${field}.length=${arr.length} exceeds MAX=${MAX}`,
                severity: 'warning',
                timestamp: Date.now(),
            };
        }
    }
    return null;
};
const TIMESTAMP_MONOTONIC = (() => {
    let lastTimestamp = 0;
    return (snap) => {
        if (snap.timestamp < lastTimestamp) {
            return {
                invariant: 'TIMESTAMP_MONOTONIC',
                snapshotId: snap.snapshotId,
                details: `snapshot.timestamp=${snap.timestamp} < lastSeen=${lastTimestamp}`,
                severity: 'warning',
                timestamp: Date.now(),
            };
        }
        lastTimestamp = snap.timestamp;
        return null;
    };
})();
const CORE_INVARIANTS = [
    SEQUENCE_NON_NEGATIVE,
    SNAPSHOT_ID_NON_EMPTY,
    PROBABILITY_IN_RANGE,
    CONFIDENCE_INTERVAL_ORDERED,
    EPISTEMIC_HEALTH_SCORE_VALID,
    ARRAY_FIELDS_BOUNDED,
    TIMESTAMP_MONOTONIC,
];
// ---------------------------------------------------------------------------
// InvariantChecker
// ---------------------------------------------------------------------------
export class InvariantChecker {
    constructor(options = {}) {
        this.customChecks = [];
        this.violations = [];
        this.maxViolations = options.maxViolations ?? 500;
    }
    /** Register a custom invariant check. Returns `this` for chaining. */
    register(check) {
        this.customChecks.push(check);
        return this;
    }
    /**
     * Run all invariant checks against the snapshot.
     * Failures are recorded internally and returned.
     * Never throws.
     */
    check(snapshot) {
        const found = [];
        for (const check of [...CORE_INVARIANTS, ...this.customChecks]) {
            try {
                const violation = check(snapshot);
                if (violation)
                    found.push(violation);
            }
            catch {
                // Invariant check must never propagate errors
            }
        }
        for (const v of found) {
            this.violations.push(v);
            if (this.violations.length > this.maxViolations) {
                this.violations.shift();
            }
        }
        return found;
    }
    /** All recorded violations (bounded history). */
    getViolations() {
        return [...this.violations];
    }
    /** Only critical-severity violations. */
    getCriticalViolations() {
        return this.violations.filter((v) => v.severity === 'critical');
    }
    /** True if any critical violations were recorded since construction. */
    hasCriticalViolations() {
        return this.violations.some((v) => v.severity === 'critical');
    }
    /** Count of violations by type. */
    violationSummary() {
        const summary = {};
        for (const v of this.violations) {
            summary[v.invariant] = (summary[v.invariant] ?? 0) + 1;
        }
        return summary;
    }
}
