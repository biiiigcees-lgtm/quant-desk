import { EVENTS } from '../../core/event-bus/events.js';
export class FeatureIntelligenceService {
    constructor(bus) {
        this.bus = bus;
        this.history = new Map();
    }
    start() {
        this.bus.on(EVENTS.FEATURES, (event) => {
            const seq = this.history.get(event.contractId) ?? [];
            seq.push(event.impliedProbability);
            if (seq.length > 20) {
                seq.shift();
            }
            this.history.set(event.contractId, seq);
            const mean = seq.reduce((acc, v) => acc + v, 0) / Math.max(1, seq.length);
            const variance = seq.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, seq.length);
            const payload = {
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
