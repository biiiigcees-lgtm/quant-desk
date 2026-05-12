import { createHash } from 'node:crypto';
import { MonotonicLogicalClock } from '../../core/determinism/logical-clock.js';
import { EVENTS } from '../../core/event-bus/events.js';
const REQUIRED_SOURCES = [
    'market_data',
    'microstructure',
    'features',
    'probability',
    'calibration',
    'drift',
];
export class SnapshotSyncService {
    constructor(bus, options, clock = new MonotonicLogicalClock()) {
        this.bus = bus;
        this.options = options;
        this.clock = clock;
        this.byContract = new Map();
    }
    start() {
        this.bus.on(EVENTS.MARKET_DATA, (event) => {
            if (this.recordSource(event.contractId, 'market_data', event, event.timestamp)) {
                this.tryEmitSnapshot(event.contractId, EVENTS.MARKET_DATA, event.timestamp);
            }
        });
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            if (this.recordSource(event.contractId, 'microstructure', event, event.timestamp)) {
                this.tryEmitSnapshot(event.contractId, EVENTS.MICROSTRUCTURE, event.timestamp);
            }
        });
        this.bus.on(EVENTS.FEATURES, (event) => {
            if (this.recordSource(event.contractId, 'features', event, event.timestamp)) {
                this.tryEmitSnapshot(event.contractId, EVENTS.FEATURES, event.timestamp);
            }
        });
        this.bus.on(EVENTS.PROBABILITY, (event) => {
            if (this.recordSource(event.contractId, 'probability', event, event.timestamp)) {
                this.tryEmitSnapshot(event.contractId, EVENTS.PROBABILITY, event.timestamp);
            }
        });
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            if (this.recordSource(event.contractId, 'calibration', event, event.timestamp)) {
                this.tryEmitSnapshot(event.contractId, EVENTS.CALIBRATION_UPDATE, event.timestamp);
            }
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            if (this.recordSource(event.contractId, 'drift', event, event.timestamp)) {
                this.tryEmitSnapshot(event.contractId, EVENTS.DRIFT_EVENT, event.timestamp);
            }
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            if (this.recordSource(event.contractId, 'anomaly', event, event.timestamp)) {
                this.tryEmitSnapshot(event.contractId, EVENTS.ANOMALY, event.timestamp);
            }
        });
        this.bus.on(EVENTS.EXECUTION_PLAN, (event) => {
            if (this.recordSource(event.contractId, 'execution_plan', event, event.timestamp)) {
                this.tryEmitSnapshot(event.contractId, EVENTS.EXECUTION_PLAN, event.timestamp);
            }
        });
    }
    recordSource(contractId, source, value, timestamp) {
        const state = this.getContractState(contractId);
        const sourceState = state.sources;
        const prev = sourceState[source];
        if (prev && timestamp < prev.timestamp) {
            this.emitStaleSourceTelemetry(contractId, source, timestamp, prev.timestamp);
            return false;
        }
        sourceState[source] = {
            value: value,
            timestamp,
            version: (prev?.version ?? 0) + 1,
        };
        return true;
    }
    tryEmitSnapshot(contractId, triggerEvent, nowTs) {
        const state = this.getContractState(contractId);
        const missingSources = REQUIRED_SOURCES.filter((source) => !state.sources[source]);
        if (missingSources.length > 0) {
            this.emitInvalid(contractId, triggerEvent, nowTs, {
                reason: 'missing-source',
                missingSources,
            });
            return;
        }
        const staleSources = [];
        for (const source of REQUIRED_SOURCES) {
            const record = state.sources[source];
            if (!record)
                continue;
            const ageMs = Math.max(0, nowTs - record.timestamp);
            if (ageMs > this.options.maxSourceAgeMs) {
                staleSources.push({ source, ageMs });
            }
        }
        if (staleSources.length > 0) {
            this.emitInvalid(contractId, triggerEvent, nowTs, {
                reason: 'stale-source',
                staleSources,
            });
            return;
        }
        const requiredTimestamps = REQUIRED_SOURCES
            .map((source) => state.sources[source]?.timestamp)
            .filter((value) => Number.isFinite(value));
        const minTs = Math.min(...requiredTimestamps);
        const maxTs = Math.max(...requiredTimestamps);
        const driftMs = Math.max(0, maxTs - minTs);
        if (driftMs > this.options.maxClockDriftMs) {
            this.emitInvalid(contractId, triggerEvent, nowTs, {
                reason: 'clock-drift',
                driftMs,
            });
            return;
        }
        state.sequence += 1;
        const sourceMeta = this.buildSourceMeta(state, nowTs);
        const marketData = state.sources.market_data?.value;
        const microstructure = state.sources.microstructure?.value;
        const features = state.sources.features?.value;
        const probability = state.sources.probability?.value;
        const calibration = state.sources.calibration?.value;
        const drift = state.sources.drift?.value;
        if (!marketData || !microstructure || !features || !probability || !calibration || !drift) {
            return;
        }
        const snapshotState = {
            marketData,
            microstructure,
            features,
            probability,
            calibration,
            drift,
            anomaly: state.sources.anomaly?.value ?? null,
            executionPlan: state.sources.execution_plan?.value ?? null,
        };
        const marketStateHash = this.buildHash(contractId, state.sequence, sourceMeta, snapshotState);
        const snapshotId = this.buildSnapshotId(contractId, state.sequence, marketStateHash);
        const aiState = {
            probability,
            calibration,
            drift,
            anomaly: snapshotState.anomaly,
        };
        const riskState = snapshotState.executionPlan
            ? {
                executionPermission: snapshotState.executionPlan.safetyMode !== 'hard-stop',
                safetyMode: snapshotState.executionPlan.safetyMode,
                reason: snapshotState.executionPlan.routeReason,
                riskLevel: snapshotState.executionPlan.safetyMode === 'hard-stop' ? 100 : 50,
            }
            : {
                executionPermission: true,
                safetyMode: 'normal',
                reason: 'no-execution-plan',
                riskLevel: 50,
            };
        const canonicalSnapshot = {
            snapshotId,
            contractId,
            sequence: state.sequence,
            timestamp: nowTs,
            hash: marketStateHash,
            sourceMeta,
            market: marketData,
            orderbook: {
                yesPrice: marketData.yesPrice,
                noPrice: marketData.noPrice,
                spread: marketData.spread,
                bidLevels: marketData.bidLevels,
                askLevels: marketData.askLevels,
                volume: marketData.volume,
            },
            microstructure,
            indicators: features,
            ai: aiState,
            aiContext: aiState,
            risk: riskState,
            riskState,
            execution: snapshotState.executionPlan,
            executionState: snapshotState.executionPlan,
            epistemic: {
                uncertaintyScore: probability.uncertaintyScore,
                calibrationError: probability.calibrationError,
                driftSeverity: drift.severity,
                anomalySeverity: snapshotState.anomaly?.severity ?? 'none',
                truthScore: clamp(1 - probability.uncertaintyScore - probability.calibrationError, 0, 1),
            },
        };
        const snapshot = {
            snapshot_id: snapshotId,
            contractId,
            triggerEvent,
            timestamp: nowTs,
            market_state_hash: marketStateHash,
            eventSequence: state.sequence,
            sourceMeta,
            state: snapshotState,
            canonical: Object.freeze(canonicalSnapshot),
        };
        this.bus.emit(EVENTS.DECISION_SNAPSHOT, Object.freeze(snapshot), {
            snapshotId,
            source: 'snapshot-sync',
            idempotencyKey: `decision-snapshot:${snapshotId}`,
            timestamp: nowTs,
        });
    }
    buildSourceMeta(state, nowTs) {
        const order = [
            'market_data',
            'microstructure',
            'features',
            'probability',
            'calibration',
            'drift',
            'anomaly',
            'execution_plan',
        ];
        return order
            .map((source) => {
            const record = state.sources[source];
            if (!record) {
                return null;
            }
            return {
                source,
                eventTimestamp: record.timestamp,
                ageMs: Math.max(0, nowTs - record.timestamp),
                version: record.version,
                required: REQUIRED_SOURCES.includes(source),
            };
        })
            .filter((value) => value !== null);
    }
    buildHash(contractId, sequence, sourceMeta, state) {
        const payload = JSON.stringify({
            contractId,
            sequence,
            sourceMeta,
            state,
        });
        return createHash('sha256').update(payload).digest('hex');
    }
    buildSnapshotId(contractId, sequence, marketStateHash) {
        return `${contractId}:${sequence}:${marketStateHash.slice(0, 16)}`;
    }
    emitStaleSourceTelemetry(contractId, source, rejectedTimestamp, latestTimestamp) {
        const telemetryTimestamp = this.clock.observe(Math.max(rejectedTimestamp, latestTimestamp));
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'snapshot.stale-event-rejected',
            value: 1,
            tags: {
                contractId,
                source,
                rejectedTimestamp: String(rejectedTimestamp),
                latestTimestamp: String(latestTimestamp),
            },
            timestamp: telemetryTimestamp,
        }, {
            snapshotId: 'na',
            source: 'snapshot-sync',
            idempotencyKey: `snapshot-stale:${contractId}:${source}:${rejectedTimestamp}`,
            timestamp: telemetryTimestamp,
        });
    }
    emitInvalid(contractId, triggerEvent, timestamp, details) {
        this.bus.emit(EVENTS.DECISION_SNAPSHOT_INVALID, {
            contractId,
            triggerEvent,
            reason: details.reason,
            missingSources: details.missingSources,
            staleSources: details.staleSources,
            driftMs: details.driftMs,
            timestamp,
        }, {
            snapshotId: 'na',
            source: 'snapshot-sync',
            idempotencyKey: `decision-snapshot-invalid:${contractId}:${triggerEvent}:${timestamp}:${details.reason}`,
            timestamp,
        });
    }
    getContractState(contractIdRaw) {
        const contractId = contractIdRaw || this.options.defaultContractId;
        const current = this.byContract.get(contractId);
        if (current) {
            return current;
        }
        const next = {
            sequence: 0,
            sources: {},
        };
        this.byContract.set(contractId, next);
        return next;
    }
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
