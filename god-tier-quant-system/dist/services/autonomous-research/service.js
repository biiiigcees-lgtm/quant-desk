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
        this.bus.on(EVENTS.SELF_IMPROVEMENT, (event) => {
            if (!event.guarded && event.adaptationRate < 0.2) {
                return;
            }
            const note = {
                title: `Adaptive policy update on ${event.contractId}`,
                body: `Self-improvement event (${event.reason}) with adaptationRate=${event.adaptationRate.toFixed(4)} guarded=${event.guarded}. Recommendation: verify strategy deltas against constitutional boundaries before promotion.`,
                tags: ['self-improvement', event.contractId, event.guarded ? 'guarded' : 'unlocked'],
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.RESEARCH_NOTE, note);
        });
        this.bus.on(EVENTS.META_CALIBRATION, (event) => {
            if (event.authorityDecay < 0.55) {
                return;
            }
            const note = {
                title: `Meta-calibration decay alert ${event.contractId}`,
                body: `Composite calibration score=${event.compositeScore.toFixed(4)} authorityDecay=${event.authorityDecay.toFixed(4)}. Recommended action: increase passive execution and reduce adaptation aggressiveness until calibration recovers.`,
                tags: ['meta-calibration', event.contractId, 'authority-decay'],
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.RESEARCH_NOTE, note);
        });
    }
}
