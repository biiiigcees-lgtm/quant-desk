import { EVENTS } from '../event-bus/events.js';
import { safeHandler } from '../errors/handler.js';
const MODE_PRIORITY = {
    NORMAL: 0,
    DEGRADED: 1,
    SAFE: 2,
    LOCKED: 3,
};
export class RiskGovernor {
    constructor(bus) {
        this.bus = bus;
        this.mode = 'NORMAL';
        this.reasons = new Map();
        this.listeners = new Set();
        this.lockedAt = null;
    }
    start() {
        this.bus.on(EVENTS.EPISTEMIC_HEALTH, safeHandler((e) => {
            if (e.score < 0.20) {
                this.elevate('epistemic:critical', 'LOCKED', `epistemic-score=${e.score.toFixed(3)}`);
            }
            else if (e.score < 0.40) {
                this.release('epistemic:critical');
                this.elevate('epistemic:degraded', 'SAFE', `epistemic-score=${e.score.toFixed(3)}`);
            }
            else if (e.score < 0.60) {
                this.release('epistemic:critical');
                this.release('epistemic:degraded');
                this.elevate('epistemic:weak', 'DEGRADED', `epistemic-score=${e.score.toFixed(3)}`);
            }
            else {
                this.release('epistemic:critical');
                this.release('epistemic:degraded');
                this.release('epistemic:weak');
            }
        }, 'RiskGovernor.epistemicHealth'));
        this.bus.on(EVENTS.EXECUTION_CONTROL, safeHandler((e) => {
            if (e.mode === 'hard-stop') {
                this.elevate('execution-control:hard-stop', 'LOCKED', `execution-control-hard-stop: ${e.reason}`);
            }
            else if (e.mode === 'safe-mode') {
                this.elevate('execution-control:safe-mode', 'SAFE', `execution-control-safe-mode: ${e.reason}`);
            }
            else {
                this.release('execution-control:safe-mode');
            }
        }, 'RiskGovernor.executionControl'));
        this.bus.on(EVENTS.ANOMALY, safeHandler((e) => {
            if (e.severity === 'critical') {
                this.elevate('anomaly:critical', 'DEGRADED', `critical-anomaly: ${e.type} on ${e.contractId}`);
            }
            else {
                this.release('anomaly:critical');
            }
        }, 'RiskGovernor.anomaly'));
        this.bus.on(EVENTS.DIGITAL_IMMUNE_ALERT, safeHandler((e) => {
            if (e.threatLevel === 'critical') {
                this.elevate('immune:critical', 'LOCKED', `digital-immune-critical: ${e.reason}`);
            }
            else {
                this.elevate('immune:elevated', 'SAFE', `digital-immune-elevated: ${e.reason}`);
            }
        }, 'RiskGovernor.immuneAlert'));
    }
    getMode() {
        return this.mode;
    }
    canExecute() {
        return this.mode === 'NORMAL' || this.mode === 'DEGRADED';
    }
    isLocked() {
        return this.mode === 'LOCKED';
    }
    lockedSince() {
        return this.lockedAt;
    }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }
    elevate(key, targetMode, detail) {
        if (this.mode === 'LOCKED')
            return;
        this.reasons.set(key, targetMode);
        this.recompute(detail);
    }
    release(key) {
        if (this.mode === 'LOCKED')
            return;
        this.reasons.delete(key);
        this.recompute(`released:${key}`);
    }
    recompute(reason) {
        if (this.mode === 'LOCKED')
            return;
        let maxMode = 'NORMAL';
        for (const m of this.reasons.values()) {
            if (MODE_PRIORITY[m] > MODE_PRIORITY[maxMode]) {
                maxMode = m;
            }
        }
        if (maxMode === this.mode)
            return;
        const previousMode = this.mode;
        this.mode = maxMode;
        if (maxMode === 'LOCKED') {
            this.lockedAt = Date.now();
        }
        const event = {
            mode: this.mode,
            previousMode,
            reason,
            timestamp: Date.now(),
        };
        this.bus.emit(EVENTS.RISK_GOVERNANCE, event);
        this.bus.emit(EVENTS.TELEMETRY, {
            level: this.mode === 'NORMAL' ? 'info' : this.mode === 'DEGRADED' ? 'warn' : 'error',
            context: 'RiskGovernor',
            message: `governance mode ${previousMode} → ${this.mode}`,
            mode: this.mode,
            previousMode,
            reason,
            timestamp: Date.now(),
        });
        for (const fn of this.listeners) {
            try {
                fn(this.mode, reason);
            }
            catch {
                // never throw from listeners
            }
        }
    }
}
