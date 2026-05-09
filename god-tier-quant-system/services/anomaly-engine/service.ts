import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { AnomalyEvent, ProbabilityEvent } from '../../core/schemas/events.js';

export class AnomalyEngine {
  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, (event) => {
      if (event.calibrationError > 0.2) {
        const anomaly: AnomalyEvent = {
          contractId: event.contractId,
          type: 'calibration-drift',
          severity: 'high',
          confidenceDegradation: 0.2,
          details: 'Calibration drift exceeds threshold',
          timestamp: Date.now(),
        };
        this.bus.emit(EVENTS.ANOMALY, anomaly);
      }
      if (event.uncertaintyScore > 0.8 && Math.abs(event.edge) > 0.03) {
        const anomaly: AnomalyEvent = {
          contractId: event.contractId,
          type: 'volatility-spike',
          severity: 'medium',
          confidenceDegradation: 0.12,
          details: 'Uncertainty spike with large edge divergence',
          timestamp: Date.now(),
        };
        this.bus.emit(EVENTS.ANOMALY, anomaly);
      }
    });
  }
}
