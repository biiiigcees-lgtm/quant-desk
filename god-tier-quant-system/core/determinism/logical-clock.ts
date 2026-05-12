export interface LogicalClock {
  now(): number;
  observe(timestamp: number): number;
  tick(step?: number): number;
}

export class MonotonicLogicalClock implements LogicalClock {
  private current: number;

  constructor(seed: number = 1) {
    this.current = Math.max(1, Math.floor(seed));
  }

  now(): number {
    return this.current;
  }

  observe(timestamp: number): number {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return this.tick();
    }
    const next = Math.max(this.current + 1, Math.floor(timestamp));
    this.current = next;
    return this.current;
  }

  tick(step: number = 1): number {
    const delta = Number.isFinite(step) ? Math.max(1, Math.floor(step)) : 1;
    this.current += delta;
    return this.current;
  }
}
