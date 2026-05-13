import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { DriftEvent, FeatureIntelligenceEvent } from '../../core/schemas/events.js';

export class DriftEngine {
  private readonly baseline = new Map<string, number>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<FeatureIntelligenceEvent>(EVENTS.FEATURE_INTELLIGENCE, (event) => {
      const base = this.baseline.get(event.contractId) ?? event.driftHint;
      this.baseline.set(event.contractId, base * 0.995 + event.driftHint * 0.005);

      const safeHint = Math.max(0, event.driftHint);
      const psi = Math.abs(safeHint - base);
      const kl = Math.max(0, safeHint * Math.log((safeHint + 1e-6) / (base + 1e-6)));
      let severity: DriftEvent['severity'];
      if (psi > 0.35 || kl > 0.25) {
        severity = 'high';
      } else if (psi > 0.2 || kl > 0.1) {
        severity = 'medium';
      } else {
        severity = 'low';
      }

      this.bus.emit(EVENTS.DRIFT_EVENT, {
        contractId: event.contractId,
        psi: Number(psi.toFixed(4)),
        kl: Number(kl.toFixed(4)),
        severity,
        timestamp: event.timestamp,
      } satisfies DriftEvent);
    });
  }
}
