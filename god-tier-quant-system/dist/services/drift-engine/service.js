import { EVENTS } from '../../core/event-bus/events.js';
export class DriftEngine {
    constructor(bus) {
        this.bus = bus;
        this.baseline = new Map();
    }
    start() {
        this.bus.on(EVENTS.FEATURE_INTELLIGENCE, (event) => {
            const base = this.baseline.get(event.contractId) ?? event.driftHint;
            this.baseline.set(event.contractId, base * 0.995 + event.driftHint * 0.005);
            const psi = Math.abs(event.driftHint - base);
            const kl = Math.max(0, event.driftHint * Math.log((event.driftHint + 1e-6) / (base + 1e-6)));
            let severity;
            if (psi > 0.35 || kl > 0.25) {
                severity = 'high';
            }
            else if (psi > 0.2 || kl > 0.1) {
                severity = 'medium';
            }
            else {
                severity = 'low';
            }
            this.bus.emit(EVENTS.DRIFT_EVENT, {
                contractId: event.contractId,
                psi: Number(psi.toFixed(4)),
                kl: Number(kl.toFixed(4)),
                severity,
                timestamp: event.timestamp,
            });
        });
    }
}
