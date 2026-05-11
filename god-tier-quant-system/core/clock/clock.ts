export interface LogicalTimestamp {
  wallClock: number;
  logicalTick: number;
  contractTick?: number;
}

export class LogicalClock {
  private globalTick = 0;
  private readonly perContract = new Map<string, number>();

  tick(contractId?: string): LogicalTimestamp {
    this.globalTick++;
    const result: LogicalTimestamp = {
      wallClock: Date.now(),
      logicalTick: this.globalTick,
    };
    if (contractId !== undefined) {
      const current = this.perContract.get(contractId) ?? 0;
      const next = current + 1;
      this.perContract.set(contractId, next);
      result.contractTick = next;
    }
    return result;
  }

  current(contractId: string): number {
    return this.perContract.get(contractId) ?? 0;
  }

  globalCurrent(): number {
    return this.globalTick;
  }

  stamp(contractId?: string): LogicalTimestamp {
    return this.tick(contractId);
  }

  reset(): void {
    this.globalTick = 0;
    this.perContract.clear();
  }

  snapshotId(contractId: string): string {
    const ts = this.tick(contractId);
    return `snap-${ts.logicalTick}-${contractId}-${ts.wallClock.toString(36)}`;
  }
}
