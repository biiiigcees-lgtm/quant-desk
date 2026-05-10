export class IdempotencyGuard {
  private readonly seenKeys: Map<string, number> = new Map();

  checkAndSet(key: string): boolean {
    this.clearOlderThan(60 * 60 * 1000);
    if (this.seenKeys.has(key)) {
      return false;
    }
    this.seenKeys.set(key, Date.now());
    return true;
  }

  clearOlderThan(ms: number): void {
    const cutoff = Date.now() - Math.max(0, ms);
    for (const [key, ts] of this.seenKeys.entries()) {
      if (ts < cutoff) {
        this.seenKeys.delete(key);
      }
    }
  }
}
