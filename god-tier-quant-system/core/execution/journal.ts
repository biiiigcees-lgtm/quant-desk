import { appendFileSync } from 'node:fs';
import { ExecutionCoordinator } from '../determinism/execution-coordinator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JournalPhase =
  | 'LOCK'
  | 'VALIDATE_SNAPSHOT'
  | 'EXECUTE'
  | 'CONFIRM'
  | 'COMMIT'
  | 'ROLLBACK'
  | 'LOG';

export interface JournalEntry {
  readonly journalId: string;
  readonly contractId: string;
  readonly idempotencyKey: string;
  readonly snapshotId: string;
  readonly phase: JournalPhase;
  readonly timestamp: number;
  readonly durationMs?: number;
  readonly payload?: unknown;
  readonly error?: string;
}

export type JournalResult<T> =
  | { ok: true; result: T; journalId: string; durationMs: number }
  | { ok: false; reason: string; journalId: string };

// ---------------------------------------------------------------------------
// ExecutionJournal
// ---------------------------------------------------------------------------

export class ExecutionJournal {
  private readonly entries: JournalEntry[] = [];
  private readonly maxEntries: number;
  private readonly logPath: string | null;

  constructor(
    private readonly coordinator: ExecutionCoordinator,
    options: { maxEntries?: number; logPath?: string | null } = {},
  ) {
    this.maxEntries = options.maxEntries ?? 1_000;
    this.logPath = options.logPath ?? null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Execute a function under full transactional safety:
   *   LOCK → VALIDATE_SNAPSHOT → EXECUTE → CONFIRM → COMMIT → LOG
   *
   * On any failure the coordinator lock is released, a ROLLBACK entry is
   * written, and an ok=false result is returned — never throws.
   */
  async execute<T>(
    contractId: string,
    idempotencyKey: string,
    snapshotId: string,
    fn: () => Promise<T>,
    options: { nowMs?: number } = {},
  ): Promise<JournalResult<T>> {
    const journalId = this.newJournalId();
    const startMs = Date.now();

    // ── PHASE 1: LOCK ─────────────────────────────────────────────────────
    this.record({ journalId, contractId, idempotencyKey, snapshotId, phase: 'LOCK', timestamp: startMs });

    const lease = this.coordinator.acquire(contractId, idempotencyKey, options.nowMs);
    if (!lease.acquired) {
      this.record({
        journalId, contractId, idempotencyKey, snapshotId,
        phase: 'ROLLBACK', timestamp: Date.now(),
        error: `lock denied: ${lease.reason ?? 'unknown'}`,
      });
      return { ok: false, reason: lease.reason ?? 'lock-denied', journalId };
    }

    // ── PHASE 2: VALIDATE_SNAPSHOT ────────────────────────────────────────
    this.record({ journalId, contractId, idempotencyKey, snapshotId, phase: 'VALIDATE_SNAPSHOT', timestamp: Date.now() });

    if (!snapshotId || snapshotId === 'snap-0-init') {
      this.coordinator.release(contractId, lease.token!, false);
      this.record({
        journalId, contractId, idempotencyKey, snapshotId,
        phase: 'ROLLBACK', timestamp: Date.now(),
        error: 'stale or uninitialized snapshot — execution aborted',
      });
      return { ok: false, reason: 'stale-snapshot', journalId };
    }

    // ── PHASE 3: EXECUTE ──────────────────────────────────────────────────
    this.record({ journalId, contractId, idempotencyKey, snapshotId, phase: 'EXECUTE', timestamp: Date.now() });

    let result: T;
    try {
      result = await fn();
    } catch (err) {
      this.coordinator.release(contractId, lease.token!, false);
      const error = err instanceof Error ? err.message : String(err);
      this.record({
        journalId, contractId, idempotencyKey, snapshotId,
        phase: 'ROLLBACK', timestamp: Date.now(), error,
      });
      return { ok: false, reason: `execution-error: ${error}`, journalId };
    }

    // ── PHASE 4: CONFIRM ──────────────────────────────────────────────────
    this.record({
      journalId, contractId, idempotencyKey, snapshotId,
      phase: 'CONFIRM', timestamp: Date.now(),
      payload: result,
    });

    // ── PHASE 5: COMMIT ───────────────────────────────────────────────────
    this.coordinator.release(contractId, lease.token!, true);
    const commitTs = Date.now();
    this.record({ journalId, contractId, idempotencyKey, snapshotId, phase: 'COMMIT', timestamp: commitTs });

    // ── PHASE 6: LOG ──────────────────────────────────────────────────────
    const durationMs = commitTs - startMs;
    this.record({
      journalId, contractId, idempotencyKey, snapshotId,
      phase: 'LOG', timestamp: Date.now(), durationMs,
    });

    return { ok: true, result, journalId, durationMs };
  }

  /** Returns the most recent `limit` entries, or all if limit is omitted. */
  getHistory(limit?: number): JournalEntry[] {
    return limit != null ? this.entries.slice(-limit) : [...this.entries];
  }

  /** Returns entries for a specific contract (most recent first). */
  getContractHistory(contractId: string, limit = 20): JournalEntry[] {
    return this.entries
      .filter((e) => e.contractId === contractId)
      .slice(-limit)
      .reverse();
  }

  /** Returns all ROLLBACK entries — the audit trail of failures. */
  getFailures(): JournalEntry[] {
    return this.entries.filter((e) => e.phase === 'ROLLBACK');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private record(entry: JournalEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    if (this.logPath) {
      try {
        appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
      } catch {
        // Append failure must never propagate — disk full or permission error
        // is logged elsewhere via safeHandler telemetry
      }
    }
  }

  private newJournalId(): string {
    return `j-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
