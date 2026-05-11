import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { FeatureEvent, FeatureIntelligenceEvent } from '../../core/schemas/events.js';

export class FeatureIntelligenceService {
  private readonly history = new Map<string, number[]>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<FeatureEvent>(EVENTS.FEATURES, (event) => {
      const seq = this.history.get(event.contractId) ?? [];
      seq.push(event.impliedProbability);
      if (seq.length > 20) {
        seq.shift();
      }
      this.history.set(event.contractId, seq);

      const mean = seq.reduce((acc, v) => acc + v, 0) / Math.max(1, seq.length);
      const variance = seq.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, seq.length);

      const payload: FeatureIntelligenceEvent = {
        contractId: event.contractId,
        qualityScore: Number(Math.max(0, 1 - event.spreadExpansionScore).toFixed(4)),
        missingRate: 0,
        driftHint: Number(Math.min(1, Math.sqrt(variance) * 4).toFixed(4)),
        timestamp: event.timestamp,
      };

      this.bus.emit(EVENTS.FEATURE_INTELLIGENCE, payload);
    });
  }
}
