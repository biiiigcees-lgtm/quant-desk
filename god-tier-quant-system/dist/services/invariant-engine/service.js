import { EVENTS } from '../../core/event-bus/events.js';
export class InvariantEngineService {
    constructor(bus) {
        this.bus = bus;
        this.snapshotStateByContract = new Map();
        this.snapshotHashById = new Map();
    }
    start() {
        this.bus.on(EVENTS.DECISION_SNAPSHOT, (event) => {
            this.validateSnapshotSequence(event);
            this.validateSnapshotImmutability(event);
        });
        this.bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
            if (!this.snapshotHashById.has(event.snapshot_id)) {
                this.raiseViolation('critical', 'decision-without-snapshot', event.timestamp, {
                    contractId: event.contractId,
                    snapshotId: event.snapshot_id,
                    cycleId: event.cycle_id,
                });
            }
        });
        this.bus.on(EVENTS.EXECUTION_PLAN, (event) => {
            if (!Number.isFinite(event.timestamp) || event.timestamp <= 0) {
                this.raiseViolation('critical', 'invalid-execution-timestamp', 1, {
                    executionId: event.executionId,
                    contractId: event.contractId,
                });
            }
        });
    }
    validateSnapshotSequence(event) {
        const state = this.snapshotStateByContract.get(event.contractId) ?? { latestSequence: 0 };
        if (event.eventSequence <= state.latestSequence) {
            this.raiseViolation('critical', 'snapshot-sequence-regression', event.timestamp, {
                contractId: event.contractId,
                latestSequence: String(state.latestSequence),
                observedSequence: String(event.eventSequence),
                snapshotId: event.snapshot_id,
            });
            return;
        }
        state.latestSequence = event.eventSequence;
        this.snapshotStateByContract.set(event.contractId, state);
    }
    validateSnapshotImmutability(event) {
        const existingHash = this.snapshotHashById.get(event.snapshot_id);
        if (existingHash && existingHash !== event.market_state_hash) {
            this.raiseViolation('critical', 'snapshot-hash-mutation', event.timestamp, {
                contractId: event.contractId,
                snapshotId: event.snapshot_id,
                previousHash: existingHash,
                observedHash: event.market_state_hash,
            });
            return;
        }
        if (!existingHash) {
            this.snapshotHashById.set(event.snapshot_id, event.market_state_hash);
        }
    }
    raiseViolation(severity, type, timestamp, tags) {
        const logicalTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 1;
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'invariant.violation',
            value: severity === 'critical' ? 1 : 0,
            tags: {
                type,
                severity,
                ...tags,
            },
            timestamp: logicalTimestamp,
        }, {
            snapshotId: tags.snapshotId ?? 'na',
            source: 'invariant-engine',
            idempotencyKey: `invariant:${type}:${logicalTimestamp}:${tags.contractId ?? 'SYSTEM'}`,
            timestamp: logicalTimestamp,
        });
        if (severity === 'critical') {
            this.bus.emit(EVENTS.EXECUTION_CONTROL, {
                contractId: tags.contractId,
                mode: 'hard-stop',
                reason: `invariant-${type}`,
                timestamp: logicalTimestamp,
            }, {
                snapshotId: tags.snapshotId ?? 'na',
                source: 'invariant-engine',
                idempotencyKey: `invariant-hard-stop:${type}:${logicalTimestamp}:${tags.contractId ?? 'SYSTEM'}`,
                timestamp: logicalTimestamp,
            });
        }
    }
}
