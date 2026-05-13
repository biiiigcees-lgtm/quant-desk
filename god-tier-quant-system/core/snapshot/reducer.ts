const MAX_METRICS = 100;

export interface ImmutableSnapshot {
  readonly snapshotId: string;
  readonly sequence: number;
  readonly timestamp: number;
  readonly probability?: Readonly<Record<string, unknown>>;
  readonly signal?: Readonly<Record<string, unknown>>;
  readonly realitySnapshot?: Readonly<Record<string, unknown>>;
  readonly calibration?: Readonly<Record<string, unknown>>;
  readonly drift?: Readonly<Record<string, unknown>>;
  readonly anomaly?: Readonly<Record<string, unknown>>;
  readonly executionState?: Readonly<Record<string, unknown>>;
  readonly executionControl?: Readonly<Record<string, unknown>>;
  readonly portfolio?: Readonly<Record<string, unknown>>;
  readonly aiAggregatedIntelligence?: Readonly<Record<string, unknown>>;
  readonly epistemicHealth?: Readonly<Record<string, unknown>>;
  readonly systemConsciousness?: Readonly<Record<string, unknown>>;
  readonly adversarialAudit?: Readonly<Record<string, unknown>>;
  readonly marketMemory?: Readonly<Record<string, unknown>>;
  readonly multiTimescaleView?: Readonly<Record<string, unknown>>;
  readonly causalInsights: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly aiOrchestrationMetrics: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly aiOrchestrationFailures: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

const ARRAY_FIELDS = new Set<keyof ImmutableSnapshot>([
  'causalInsights',
  'aiOrchestrationMetrics',
  'aiOrchestrationFailures',
]);

type Listener = (snap: ImmutableSnapshot) => void;

export class SnapshotReducer {
  private current: ImmutableSnapshot;
  private readonly listeners: Set<Listener> = new Set();

  constructor(initial?: ImmutableSnapshot) {
    this.current = initial ?? SnapshotReducer.empty();
  }

  /** Returns the initial empty snapshot. */
  static empty(): ImmutableSnapshot {
    return Object.freeze({
      snapshotId: 'snap-0-init',
      sequence: 0,
      timestamp: 0,
      causalInsights: Object.freeze([]) as ReadonlyArray<Readonly<Record<string, unknown>>>,
      aiOrchestrationMetrics: Object.freeze([]) as ReadonlyArray<Readonly<Record<string, unknown>>>,
      aiOrchestrationFailures: Object.freeze([]) as ReadonlyArray<Readonly<Record<string, unknown>>>,
    });
  }

  /** Returns current frozen snapshot. */
  getSnapshot(): ImmutableSnapshot {
    return this.current;
  }

  /**
   * Creates a new frozen snapshot with the updated field.
   * For array fields, prepends the new value and bounds to MAX_METRICS.
   */
  apply(field: keyof ImmutableSnapshot, value: unknown): ImmutableSnapshot {
    const seq = this.current.sequence + 1;
    const id = `snap-${seq}-${Date.now().toString(36)}`;
    const ts = Date.now();

    let updated: unknown;

    if (ARRAY_FIELDS.has(field)) {
      const existing = this.current[field] as ReadonlyArray<Readonly<Record<string, unknown>>>;
      const entry = Object.freeze(
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : { value },
      );
      const next = [entry, ...existing];
      if (next.length > MAX_METRICS) next.length = MAX_METRICS;
      updated = Object.freeze(next);
    } else {
      updated =
        value !== null && typeof value === 'object'
          ? Object.freeze(value as Record<string, unknown>)
          : value;
    }

    const next: ImmutableSnapshot = Object.freeze({
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
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Returns a JSON-serializable deep copy of the current snapshot. */
  toSerializable(): unknown {
    return JSON.parse(JSON.stringify(this.current));
  }

  private notifyListeners(snap: ImmutableSnapshot): void {
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch {
        // Never throw from listener errors
      }
    }
  }
}
