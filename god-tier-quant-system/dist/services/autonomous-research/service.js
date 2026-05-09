import { EVENTS } from '../../core/event-bus/events.js';
export class AutonomousResearchService {
    constructor(bus) {
        this.bus = bus;
    }
    start() {
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            if (event.severity === 'low') {
                return;
            }
            const note = {
                title: `Drift detected on ${event.contractId}`,
                body: `Observed distributional change with PSI=${event.psi.toFixed(4)} KL=${event.kl.toFixed(4)}. Suggested next step: review recent feature windows and retrain calibration map for this contract.`,
                tags: ['drift', 'calibration', event.contractId],
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.RESEARCH_NOTE, note);
        });
    }
}
