export class IdempotencyGuard {
  private readonly seenKeys: Set<string> = new Set();

  checkAndSet(key: string): boolean {
    if (this.seenKeys.has(key)) {
      return false;
    }
    this.seenKeys.add(key);
    return true;
  }

  clearOlderThan(_ms: number): void {
    // Simple in-memory implementation; can be replaced with timed map later.
  }
}
