import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { DriftEvent, ResearchNoteEvent } from '../../core/schemas/events.js';

export class AutonomousResearchService {
  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, (event) => {
      if (event.severity === 'low') {
        return;
      }

      const note: ResearchNoteEvent = {
        title: `Drift detected on ${event.contractId}`,
        body: `Observed distributional change with PSI=${event.psi.toFixed(4)} KL=${event.kl.toFixed(4)}. Suggested next step: review recent feature windows and retrain calibration map for this contract.`,
        tags: ['drift', 'calibration', event.contractId],
        timestamp: event.timestamp,
      };

      this.bus.emit(EVENTS.RESEARCH_NOTE, note);
    });
  }
}
