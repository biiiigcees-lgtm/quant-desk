export class LogicalClock {
    constructor() {
        this.globalTick = 0;
        this.perContract = new Map();
    }
    tick(contractId) {
        this.globalTick++;
        const result = {
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
    current(contractId) {
        return this.perContract.get(contractId) ?? 0;
    }
    globalCurrent() {
        return this.globalTick;
    }
    stamp(contractId) {
        return this.tick(contractId);
    }
    reset() {
        this.globalTick = 0;
        this.perContract.clear();
    }
    snapshotId(contractId) {
        const ts = this.tick(contractId);
        return `snap-${ts.logicalTick}-${contractId}-${ts.wallClock.toString(36)}`;
    }
}
