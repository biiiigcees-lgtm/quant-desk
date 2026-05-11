type PruneFunction = () => void;

export interface LifecycleStats {
  registrations: number;
  pruneCount: number;
  lastPruneAt: number | null;
}

export class MemoryLifecycleManager {
  private readonly registrations = new Map<string, PruneFunction>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private pruneCount = 0;
  private lastPruneAt: number | null = null;

  register(name: string, fn: PruneFunction): () => void {
    this.registrations.set(name, fn);
    return () => {
      this.registrations.delete(name);
    };
  }

  prune(): void {
    this.pruneCount++;
    this.lastPruneAt = Date.now();
    for (const [, fn] of this.registrations) {
      try {
        fn();
      } catch {
        // prune errors must never crash the manager
      }
    }
  }

  start(intervalMs: number = 5 * 60 * 1000): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      this.prune();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stats(): LifecycleStats {
    return {
      registrations: this.registrations.size,
      pruneCount: this.pruneCount,
      lastPruneAt: this.lastPruneAt,
    };
  }
}
