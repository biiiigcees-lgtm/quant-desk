import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { CalibrationEvent, ProbabilityEvent } from '../../core/schemas/events.js';

interface Outcome {
  p: number;
  y: number;
}

export class CalibrationEngine {
  private readonly outcomes = new Map<string, Outcome[]>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, (event) => {
      const observed = event.marketImpliedProbability >= 0.5 ? 1 : 0;
      const seq = this.outcomes.get(event.contractId) ?? [];
      seq.push({ p: event.estimatedProbability, y: observed });
      if (seq.length > 200) {
        seq.shift();
      }
      this.outcomes.set(event.contractId, seq);

      const brier = seq.reduce((acc, row) => acc + (row.p - row.y) ** 2, 0) / Math.max(1, seq.length);
      const ece = seq.reduce((acc, row) => acc + Math.abs(row.p - row.y), 0) / Math.max(1, seq.length);
      const calibratedConfidence = Number(Math.max(0, 1 - ece).toFixed(4));

      const payload: CalibrationEvent = {
        contractId: event.contractId,
        ece: Number(ece.toFixed(4)),
        brier: Number(brier.toFixed(4)),
        calibratedConfidence,
        timestamp: event.timestamp,
      };

      this.bus.emit(EVENTS.CALIBRATION_UPDATE, payload);
    });
  }
}
