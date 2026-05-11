import { EVENTS } from '../../core/event-bus/events.js';
export class DigitalImmuneSystemService {
    constructor(bus, options) {
        this.bus = bus;
        this.options = options;
        this.cooldownUntil = 0;
        this.lastContractId = 'KXBTC-DEMO';
    }
    start() {
        this.bus.on(EVENTS.EPISTEMIC_HEALTH, (event) => {
            this.lastContractId = event.contractId;
            if (event.status === 'critical') {
                this.triggerAlert('critical', event.contractId, 'epistemic-health-critical');
            }
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            this.lastContractId = event.contractId;
            if (event.severity === 'critical' || event.severity === 'high') {
                this.triggerAlert(event.severity === 'critical' ? 'critical' : 'elevated', event.contractId, `anomaly-${event.type}`);
            }
        });
        this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
            this.lastContractId = event.contractId;
            if (event.status === 'fail' && event.kind === 'adversarial') {
                this.triggerAlert('elevated', event.contractId, 'adversarial-validation-failure');
            }
        });
    }
    triggerAlert(level, contractId, reason) {
        const now = Date.now();
        if (now < this.cooldownUntil) {
            return;
        }
        const mode = level === 'critical' ? 'hard-stop' : 'safe-mode';
        this.cooldownUntil = now + this.options.cooldownMs;
        const alert = {
            contractId: contractId || this.lastContractId,
            threatLevel: level,
            reason,
            recommendedMode: mode,
            cooldownUntil: this.cooldownUntil,
            timestamp: now,
        };
        this.bus.emit(EVENTS.DIGITAL_IMMUNE_ALERT, alert);
        this.bus.emit(EVENTS.EXECUTION_CONTROL, {
            contractId: alert.contractId,
            mode,
            reason: `digital-immune:${reason}`,
            timestamp: now,
        });
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'organism.immune.alert',
            value: level === 'critical' ? 1 : 0.5,
            tags: { level, contractId: alert.contractId },
            timestamp: now,
        });
    }
}
