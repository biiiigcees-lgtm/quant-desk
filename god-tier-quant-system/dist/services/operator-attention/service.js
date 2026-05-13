import { EVENTS } from '../../core/event-bus/events.js';
export class OperatorAttentionService {
    constructor(bus) {
        this.bus = bus;
        this.byContract = new Map();
    }
    start() {
        this.bus.on(EVENTS.SYSTEM_CONSCIOUSNESS, (event) => {
            const state = this.getState(event.contractId);
            state.consciousness = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.ADVERSARIAL_AUDIT, (event) => {
            const state = this.getState(event.contractId);
            state.adversarial = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.META_CALIBRATION, (event) => {
            const state = this.getState(event.contractId);
            state.calibration = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            const state = this.getState(event.contractId);
            state.anomalySeverity = event.severity;
            this.emit(event.contractId, event.timestamp);
        });
    }
    getState(contractId) {
        const current = this.byContract.get(contractId);
        if (current) {
            return current;
        }
        const next = {
            anomalySeverity: 'none',
        };
        this.byContract.set(contractId, next);
        return next;
    }
    emit(contractId, timestamp) {
        const state = this.byContract.get(contractId);
        if (!state) {
            return;
        }
        const contradictionHotspots = state.consciousness?.contradictions
            .slice(0, 4)
            .map((item) => `${item.source}->${item.target}`) ?? [];
        const priority = [];
        if ((state.calibration?.authorityDecay ?? 0) > 0.55) {
            priority.push('meta-calibration-decay');
        }
        if ((state.adversarial?.adversarialScore ?? 0) > 0.55) {
            priority.push('adversarial-counterfactual');
        }
        if ((state.consciousness?.contradictionDensity ?? 0) > 0.35) {
            priority.push('contradiction-resolution');
        }
        if (state.anomalySeverity === 'high' || state.anomalySeverity === 'critical') {
            priority.push('anomaly-triage');
        }
        const critical = (state.calibration?.authorityDecay ?? 0) > 0.75 ||
            state.anomalySeverity === 'critical' ||
            (state.adversarial?.adversarialScore ?? 0) > 0.8;
        const focused = (state.calibration?.authorityDecay ?? 0) > 0.55 ||
            (state.consciousness?.contradictionDensity ?? 0) > 0.35 ||
            (state.adversarial?.adversarialScore ?? 0) > 0.55 ||
            state.anomalySeverity === 'high';
        const focus = deriveFocus(critical, focused);
        const density = densityFromFocus(focus);
        const event = {
            contractId,
            focus,
            priority: priority.length > 0 ? priority : ['normal-monitoring'],
            contradictionHotspots,
            density,
            timestamp,
        };
        this.bus.emit(EVENTS.OPERATOR_ATTENTION, event);
    }
}
function deriveFocus(critical, focused) {
    if (critical) {
        return 'critical';
    }
    if (focused) {
        return 'focused';
    }
    return 'normal';
}
function densityFromFocus(focus) {
    if (focus === 'critical') {
        return 0.92;
    }
    if (focus === 'focused') {
        return 0.68;
    }
    return 0.4;
}
