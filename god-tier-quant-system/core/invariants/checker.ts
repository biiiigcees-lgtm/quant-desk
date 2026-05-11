import { ImmutableSnapshot } from '../snapshot/reducer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvariantSeverity = 'critical' | 'warning';

export interface InvariantViolation {
  readonly invariant: string;
  readonly snapshotId: string;
  readonly details: string;
  readonly severity: InvariantSeverity;
  readonly timestamp: number;
}

export type InvariantCheck = (snapshot: ImmutableSnapshot) => InvariantViolation | null;

// ---------------------------------------------------------------------------
// Built-in core invariants
// ---------------------------------------------------------------------------

const SEQUENCE_NON_NEGATIVE: InvariantCheck = (snap) => {
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

const SNAPSHOT_ID_NON_EMPTY: InvariantCheck = (snap) => {
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

const PROBABILITY_IN_RANGE: InvariantCheck = (snap) => {
  if (!snap.probability) return null;
  const est = (snap.probability as Record<string, unknown>)['estimatedProbability'];
  if (est === undefined) return null;
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

const CONFIDENCE_INTERVAL_ORDERED: InvariantCheck = (snap) => {
  if (!snap.probability) return null;
  const ci = (snap.probability as Record<string, unknown>)['confidenceInterval'];
  if (!Array.isArray(ci) || ci.length < 2) return null;
  const [lo, hi] = ci as [unknown, unknown];
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

const EPISTEMIC_HEALTH_SCORE_VALID: InvariantCheck = (snap) => {
  if (!snap.epistemicHealth) return null;
  const score = (snap.epistemicHealth as Record<string, unknown>)['epistemicHealthScore'];
  if (score === undefined) return null;
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

const ARRAY_FIELDS_BOUNDED: InvariantCheck = (snap) => {
  const MAX = 100;
  for (const field of ['aiOrchestrationMetrics', 'aiOrchestrationFailures', 'causalInsights'] as const) {
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

const TIMESTAMP_MONOTONIC: InvariantCheck = (() => {
  let lastTimestamp = 0;
  return (snap: ImmutableSnapshot): InvariantViolation | null => {
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

const CORE_INVARIANTS: InvariantCheck[] = [
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
  private readonly customChecks: InvariantCheck[] = [];
  private readonly violations: InvariantViolation[] = [];
  private readonly maxViolations: number;

  constructor(options: { maxViolations?: number } = {}) {
    this.maxViolations = options.maxViolations ?? 500;
  }

  /** Register a custom invariant check. Returns `this` for chaining. */
  register(check: InvariantCheck): this {
    this.customChecks.push(check);
    return this;
  }

  /**
   * Run all invariant checks against the snapshot.
   * Failures are recorded internally and returned.
   * Never throws.
   */
  check(snapshot: ImmutableSnapshot): InvariantViolation[] {
    const found: InvariantViolation[] = [];

    for (const check of [...CORE_INVARIANTS, ...this.customChecks]) {
      try {
        const violation = check(snapshot);
        if (violation) found.push(violation);
      } catch {
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
  getViolations(): InvariantViolation[] {
    return [...this.violations];
  }

  /** Only critical-severity violations. */
  getCriticalViolations(): InvariantViolation[] {
    return this.violations.filter((v) => v.severity === 'critical');
  }

  /** True if any critical violations were recorded since construction. */
  hasCriticalViolations(): boolean {
    return this.violations.some((v) => v.severity === 'critical');
  }

  /** Count of violations by type. */
  violationSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const v of this.violations) {
      summary[v.invariant] = (summary[v.invariant] ?? 0) + 1;
    }
    return summary;
  }
}
