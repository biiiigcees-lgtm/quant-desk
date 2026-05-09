import { createHash } from 'node:crypto';
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
    constructor(bus, options) {
        this.bus = bus;
        this.options = options;
        this.byContract = new Map();
    }
    start() {
        this.bus.on(EVENTS.MARKET_DATA, (event) => {
            this.recordSource(event.contractId, 'market_data', event, event.timestamp);
            this.tryEmitSnapshot(event.contractId, EVENTS.MARKET_DATA, event.timestamp);
        });
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            this.recordSource(event.contractId, 'microstructure', event, event.timestamp);
            this.tryEmitSnapshot(event.contractId, EVENTS.MICROSTRUCTURE, event.timestamp);
        });
        this.bus.on(EVENTS.FEATURES, (event) => {
            this.recordSource(event.contractId, 'features', event, event.timestamp);
            this.tryEmitSnapshot(event.contractId, EVENTS.FEATURES, event.timestamp);
        });
        this.bus.on(EVENTS.PROBABILITY, (event) => {
            this.recordSource(event.contractId, 'probability', event, event.timestamp);
            this.tryEmitSnapshot(event.contractId, EVENTS.PROBABILITY, event.timestamp);
        });
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            this.recordSource(event.contractId, 'calibration', event, event.timestamp);
            this.tryEmitSnapshot(event.contractId, EVENTS.CALIBRATION_UPDATE, event.timestamp);
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            this.recordSource(event.contractId, 'drift', event, event.timestamp);
            this.tryEmitSnapshot(event.contractId, EVENTS.DRIFT_EVENT, event.timestamp);
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            this.recordSource(event.contractId, 'anomaly', event, event.timestamp);
            this.tryEmitSnapshot(event.contractId, EVENTS.ANOMALY, event.timestamp);
        });
        this.bus.on(EVENTS.EXECUTION_PLAN, (event) => {
            this.recordSource(event.contractId, 'execution_plan', event, event.timestamp);
            this.tryEmitSnapshot(event.contractId, EVENTS.EXECUTION_PLAN, event.timestamp);
        });
    }
    recordSource(contractId, source, value, timestamp) {
        const state = this.getContractState(contractId);
        if (source === 'market_data') {
            const prev = state.sources.market_data;
            state.sources.market_data = {
                value: value,
                timestamp,
                version: (prev?.version ?? 0) + 1,
            };
            return;
        }
        if (source === 'microstructure') {
            const prev = state.sources.microstructure;
            state.sources.microstructure = {
                value: value,
                timestamp,
                version: (prev?.version ?? 0) + 1,
            };
            return;
        }
        if (source === 'features') {
            const prev = state.sources.features;
            state.sources.features = {
                value: value,
                timestamp,
                version: (prev?.version ?? 0) + 1,
            };
            return;
        }
        if (source === 'probability') {
            const prev = state.sources.probability;
            state.sources.probability = {
                value: value,
                timestamp,
                version: (prev?.version ?? 0) + 1,
            };
            return;
        }
        if (source === 'calibration') {
            const prev = state.sources.calibration;
            state.sources.calibration = {
                value: value,
                timestamp,
                version: (prev?.version ?? 0) + 1,
            };
            return;
        }
        if (source === 'drift') {
            const prev = state.sources.drift;
            state.sources.drift = {
                value: value,
                timestamp,
                version: (prev?.version ?? 0) + 1,
            };
            return;
        }
        if (source === 'anomaly') {
            const prev = state.sources.anomaly;
            state.sources.anomaly = {
                value: value,
                timestamp,
                version: (prev?.version ?? 0) + 1,
            };
            return;
        }
        const prev = state.sources.execution_plan;
        state.sources.execution_plan = {
            value: value,
            timestamp,
            version: (prev?.version ?? 0) + 1,
        };
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
        const snapshot = {
            snapshot_id: `${contractId}:${state.sequence}:${nowTs}`,
            contractId,
            triggerEvent,
            timestamp: nowTs,
            market_state_hash: marketStateHash,
            eventSequence: state.sequence,
            sourceMeta,
            state: snapshotState,
        };
        this.bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);
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
    emitInvalid(contractId, triggerEvent, timestamp, details) {
        this.bus.emit(EVENTS.DECISION_SNAPSHOT_INVALID, {
            contractId,
            triggerEvent,
            reason: details.reason,
            missingSources: details.missingSources,
            staleSources: details.staleSources,
            driftMs: details.driftMs,
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
