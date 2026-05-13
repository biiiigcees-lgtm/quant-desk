import { EVENTS } from '../../core/event-bus/events.js';
const WINDOW = 30;
export class MetaCalibrationService {
    constructor(bus) {
        this.bus = bus;
        this.byContract = new Map();
    }
    start() {
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            const state = this.getState(event.contractId);
            state.signalCalibration = clamp(event.calibratedConfidence, 0, 1);
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.PROBABILITY, (event) => {
            const state = this.getState(event.contractId);
            state.uncertaintyCalibration = clamp(1 - event.uncertaintyScore, 0, 1);
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const state = this.getState(event.contractId);
            state.regimeCalibration = regimeCalibrationFromDriftSeverity(event.severity);
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
            const contractId = event.contractId ?? 'global';
            const state = this.getState(contractId);
            state.aiCalibration = clamp(Number(event.probability_adjustment?.calibrationScore ?? 0), 0, 1);
            this.emit(contractId, Number(event.timestamp ?? Date.now()));
        });
        this.bus.on(EVENTS.EXECUTION_STATE, (event) => {
            const state = this.getState(event.contractId);
            const outcome = classifyExecutionOutcome(event.phase);
            if (outcome) {
                state.successWindow.push(outcome);
                if (state.successWindow.length > WINDOW) {
                    state.successWindow.shift();
                }
            }
            const failures = state.successWindow.filter((x) => x === 'failure').length;
            const ratio = state.successWindow.length === 0 ? 0 : failures / state.successWindow.length;
            state.executionCalibration = clamp(1 - ratio, 0, 1);
            this.emit(event.contractId, event.timestamp);
        });
    }
    getState(contractId) {
        const current = this.byContract.get(contractId);
        if (current) {
            return current;
        }
        const next = {
            signalCalibration: 0.7,
            aiCalibration: 0.65,
            executionCalibration: 0.75,
            regimeCalibration: 0.75,
            uncertaintyCalibration: 0.7,
            successWindow: [],
        };
        this.byContract.set(contractId, next);
        return next;
    }
    emit(contractId, timestamp) {
        const state = this.byContract.get(contractId);
        if (!state) {
            return;
        }
        const compositeScore = clamp(state.signalCalibration * 0.28 +
            state.aiCalibration * 0.2 +
            state.executionCalibration * 0.2 +
            state.regimeCalibration * 0.17 +
            state.uncertaintyCalibration * 0.15, 0, 1);
        const authorityDecay = clamp(1 - compositeScore, 0, 1);
        const event = {
            contractId,
            signalCalibration: Number(state.signalCalibration.toFixed(4)),
            aiCalibration: Number(state.aiCalibration.toFixed(4)),
            executionCalibration: Number(state.executionCalibration.toFixed(4)),
            regimeCalibration: Number(state.regimeCalibration.toFixed(4)),
            uncertaintyCalibration: Number(state.uncertaintyCalibration.toFixed(4)),
            compositeScore: Number(compositeScore.toFixed(4)),
            authorityDecay: Number(authorityDecay.toFixed(4)),
            timestamp,
        };
        this.bus.emit(EVENTS.META_CALIBRATION, event);
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'meta.calibration.composite',
            value: event.compositeScore,
            tags: { contractId },
            timestamp,
        });
        const mode = modeFromAuthorityDecay(authorityDecay);
        if (mode !== 'normal' && mode !== state.lastMode) {
            this.bus.emit(EVENTS.EXECUTION_CONTROL, {
                contractId,
                mode,
                reason: `meta-calibration-decay:${authorityDecay.toFixed(3)}`,
                timestamp,
            });
        }
        state.lastMode = mode;
    }
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
function regimeCalibrationFromDriftSeverity(severity) {
    if (severity === 'high') {
        return 0.35;
    }
    if (severity === 'medium') {
        return 0.62;
    }
    return 0.86;
}
function classifyExecutionOutcome(phase) {
    if (phase === 'filled' || phase === 'partially_filled') {
        return 'success';
    }
    if (phase === 'rejected' || phase === 'expired' || phase === 'cancelled') {
        return 'failure';
    }
    return undefined;
}
function modeFromAuthorityDecay(authorityDecay) {
    if (authorityDecay >= 0.82) {
        return 'hard-stop';
    }
    if (authorityDecay >= 0.62) {
        return 'safe-mode';
    }
    return 'normal';
}
