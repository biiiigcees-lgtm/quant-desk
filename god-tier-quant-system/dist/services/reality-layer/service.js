import { createHash } from 'node:crypto';
import { EVENTS } from '../../core/event-bus/events.js';
const DRIFT_FACTOR = {
    none: 1, low: 0.9, medium: 0.7, high: 0.4,
};
const ANOMALY_FACTOR = {
    none: 1, low: 0.85, medium: 0.65, high: 0.35, critical: 0.05,
};
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
export class RealityLayerService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
        this.snapshotSequence = 0;
    }
    start() {
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            const s = this.getOrCreate(event.contractId);
            s.calibrationFactor = Math.max(0, Math.min(1, 1 - event.ece * 4));
            s.lastTimestamp = event.timestamp;
            this.emit(event.contractId);
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const s = this.getOrCreate(event.contractId);
            s.driftFactor = DRIFT_FACTOR[event.severity] ?? 1.0;
            s.lastTimestamp = event.timestamp;
            this.emit(event.contractId);
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            const s = this.getOrCreate(event.contractId);
            s.anomalyFactor = ANOMALY_FACTOR[event.severity] ?? 1.0;
            s.lastTimestamp = event.timestamp;
            this.emit(event.contractId);
        });
        this.bus.on(EVENTS.BELIEF_GRAPH_UPDATE, (event) => {
            const s = this.getOrCreate(event.contractId);
            s.beliefFactor = event.graphConfidence;
            s.lastTimestamp = event.timestamp;
            this.emit(event.contractId);
        });
        this.bus.on(EVENTS.SYSTEM_BELIEF_UPDATE, (event) => {
            const s = this.getOrCreate(event.contractId);
            s.beliefFactor = clamp(event.belief.selfAssessment.reliabilityScore * (1 - event.confidencePenalty * 0.5), 0, 1);
            s.lastTimestamp = event.timestamp;
            this.emit(event.contractId);
        });
        this.bus.on(EVENTS.EXECUTION_CONTROL, (event) => {
            // Hard-stop applies globally; use the contractId as key if present, else '*'
            const id = event.contractId ?? '*';
            const s = this.getOrCreate(id);
            s.hardStop = event.mode === 'hard-stop';
            s.lastTimestamp = event.timestamp;
            this.emit(id);
        });
    }
    getLatestSnapshot(contractId) {
        const s = this.state.get(contractId) ?? this.state.get('*');
        if (!s)
            return undefined;
        return this.buildSnapshot(contractId, s);
    }
    getAllSnapshots() {
        const result = [];
        for (const [id, s] of this.state) {
            result.push(this.buildSnapshot(id, s));
        }
        return result;
    }
    getOrCreate(contractId) {
        if (!this.state.has(contractId)) {
            this.state.set(contractId, {
                calibrationFactor: 0.8,
                driftFactor: 1,
                anomalyFactor: 1,
                beliefFactor: 0.5,
                hardStop: false,
                lastTimestamp: Date.now(),
            });
        }
        return this.state.get(contractId);
    }
    buildSnapshot(contractId, s) {
        const truthScore = Number((s.calibrationFactor * s.driftFactor * s.anomalyFactor * s.beliefFactor).toFixed(4));
        const isHalted = s.hardStop || truthScore < 0.20;
        const isDegraded = !isHalted && truthScore < 0.45;
        const isCautious = !isHalted && !isDegraded && truthScore < 0.70;
        const systemState = isHalted ? 'halted' : isDegraded ? 'degraded' : isCautious ? 'cautious' : 'nominal';
        const executionAllowed = systemState !== 'halted';
        const anomalyNotHigh = !((systemState === 'degraded' && s.anomalyFactor <= ANOMALY_FACTOR.high));
        const executionPermission = executionAllowed && anomalyNotHigh;
        const isLowUncertainty = truthScore >= 0.70;
        const isMediumUncertainty = truthScore >= 0.45;
        const isHighUncertainty = truthScore >= 0.20;
        const uncertaintyState = isLowUncertainty ? 'low' : isMediumUncertainty ? 'medium' : isHighUncertainty ? 'high' : 'extreme';
        const snapshotInput = `${contractId}:${truthScore}:${s.lastTimestamp}`;
        const canonicalSnapshotId = createHash('sha1').update(snapshotInput).digest('hex').slice(0, 12);
        return {
            contractId,
            systemState,
            actionableState: executionPermission && systemState !== 'degraded',
            uncertaintyState,
            executionPermission,
            canonicalSnapshotId,
            truthScore,
            calibrationFactor: Number(s.calibrationFactor.toFixed(4)),
            driftFactor: Number(s.driftFactor.toFixed(4)),
            anomalyFactor: Number(s.anomalyFactor.toFixed(4)),
            beliefFactor: Number(s.beliefFactor.toFixed(4)),
            timestamp: s.lastTimestamp,
        };
    }
    emit(contractId) {
        const s = this.state.get(contractId);
        if (!s)
            return;
        this.snapshotSequence += 1;
        const snapshot = this.buildSnapshot(contractId, s);
        this.bus.emit(EVENTS.REALITY_SNAPSHOT, snapshot);
    }
}
