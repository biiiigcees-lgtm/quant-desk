export interface ExecutionLeaseResult {
  acquired: boolean;
  token?: string;
  reason?: 'duplicate' | 'contract-busy';
}

interface ActiveLease {
  token: string;
  contractId: string;
  idempotencyKey: string;
  expiresAt: number;
}

interface ExecutionCoordinatorOptions {
  leaseTtlMs: number;
  idempotencyTtlMs: number;
}

export class ExecutionCoordinator {
  private readonly activeByContract = new Map<string, ActiveLease>();
  private readonly processedKeys = new Map<string, number>();
  private nextToken = 1;

  private readonly options: ExecutionCoordinatorOptions;

  constructor(options?: Partial<ExecutionCoordinatorOptions>) {
    this.options = {
      leaseTtlMs: options?.leaseTtlMs ?? 5_000,
      idempotencyTtlMs: options?.idempotencyTtlMs ?? 30_000,
    };
  }

  acquire(contractId: string, idempotencyKey: string, nowMs: number = Date.now()): ExecutionLeaseResult {
    this.prune(nowMs);

    if (this.processedKeys.has(idempotencyKey)) {
      return { acquired: false, reason: 'duplicate' };
    }

    const active = this.activeByContract.get(contractId);
    if (active && active.expiresAt > nowMs) {
      return { acquired: false, reason: 'contract-busy' };
    }

    const token = `${contractId}:${this.nextToken++}`;
    this.activeByContract.set(contractId, {
      token,
      contractId,
      idempotencyKey,
      expiresAt: nowMs + this.options.leaseTtlMs,
    });
    this.processedKeys.set(idempotencyKey, nowMs);

    return {
      acquired: true,
      token,
    };
  }

  release(contractId: string, token: string, success: boolean = true): void {
    const active = this.activeByContract.get(contractId);
    if (active?.token !== token) {
      return;
    }

    this.activeByContract.delete(contractId);
    if (!success) {
      this.processedKeys.delete(active.idempotencyKey);
    }
  }

  private prune(nowMs: number): void {
    const idempotencyCutoff = nowMs - this.options.idempotencyTtlMs;
    for (const [key, timestamp] of this.processedKeys.entries()) {
      if (timestamp < idempotencyCutoff) {
        this.processedKeys.delete(key);
      }
    }

    for (const [contractId, lease] of this.activeByContract.entries()) {
      if (lease.expiresAt <= nowMs) {
        this.activeByContract.delete(contractId);
      }
    }
  }
}
