export class ExecutionCoordinator {
    constructor(options) {
        this.activeByContract = new Map();
        this.processedKeys = new Map();
        this.nextToken = 1;
        this.options = {
            leaseTtlMs: options?.leaseTtlMs ?? 5000,
            idempotencyTtlMs: options?.idempotencyTtlMs ?? 30000,
        };
    }
    acquire(contractId, idempotencyKey, nowMs = Date.now()) {
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
    release(contractId, token, success = true) {
        const active = this.activeByContract.get(contractId);
        if (active?.token !== token) {
            return;
        }
        this.activeByContract.delete(contractId);
        if (!success) {
            this.processedKeys.delete(active.idempotencyKey);
        }
    }
    prune(nowMs) {
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
