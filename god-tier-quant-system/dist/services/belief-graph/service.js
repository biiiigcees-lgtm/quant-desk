import { EVENTS } from '../../core/event-bus/events.js';
// Causal influence weights for each node type in the constitutional belief graph.
// Higher weight = stronger pull on the final probability adjustment.
const NODE_WEIGHTS = {
    microstructure: 0.30,
    calibration: 0.25,
    drift: 0.25,
    anomaly: 0.20,
};
export class BeliefGraphService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            const belief = this.clamp((event.obi + 1) / 2 * 0.5 + event.sweepProbability * 0.5);
            this.upsertNode(event.contractId, 'microstructure', {
                id: `micro:${event.contractId}`,
                type: 'microstructure',
                belief,
                confidence: 1 - event.spreadExpansionScore,
                weight: NODE_WEIGHTS.microstructure,
                updatedAt: event.timestamp,
            });
        });
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            // Lower calibration error → higher belief in the model's predictions.
            const belief = this.clamp(1 - event.ece * 3);
            const confidence = this.clamp(1 - event.brier * 2);
            this.upsertNode(event.contractId, 'calibration', {
                id: `cal:${event.contractId}`,
                type: 'calibration',
                belief,
                confidence,
                weight: NODE_WEIGHTS.calibration,
                updatedAt: event.timestamp,
            });
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const driftMagnitude = Math.min(1, (event.psi + event.kl) / 2);
            // High drift reduces belief in the current probability estimate.
            const belief = this.clamp(1 - driftMagnitude);
            const confidence = event.severity === 'high' ? 0.9 : event.severity === 'medium' ? 0.6 : 0.3;
            this.upsertNode(event.contractId, 'drift', {
                id: `drift:${event.contractId}`,
                type: 'drift',
                belief,
                confidence,
                weight: NODE_WEIGHTS.drift,
                updatedAt: event.timestamp,
            });
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            const severityImpact = { low: 0.1, medium: 0.3, high: 0.6, critical: 0.9 }[event.severity];
            const belief = this.clamp(1 - severityImpact - event.confidenceDegradation * 0.3);
            this.upsertNode(event.contractId, 'anomaly', {
                id: `anom:${event.contractId}`,
                type: 'anomaly',
                belief,
                confidence: severityImpact,
                weight: NODE_WEIGHTS.anomaly,
                updatedAt: event.timestamp,
            });
        });
    }
    upsertNode(contractId, key, node) {
        const s = this.state.get(contractId) ?? { lastUpdated: 0 };
        s[key] = node;
        s.lastUpdated = node.updatedAt;
        this.state.set(contractId, s);
        this.emit(contractId, node.updatedAt);
    }
    emit(contractId, timestamp) {
        const s = this.state.get(contractId);
        if (!s)
            return;
        const nodes = [s.microstructure, s.calibration, s.drift, s.anomaly].filter((n) => n !== undefined);
        if (nodes.length === 0)
            return;
        let weightedBeliefSum = 0;
        let weightedConfidenceSum = 0;
        let totalWeight = 0;
        for (const node of nodes) {
            weightedBeliefSum += node.belief * node.weight * node.confidence;
            weightedConfidenceSum += node.confidence * node.weight;
            totalWeight += node.weight;
        }
        const avgBelief = totalWeight > 0 ? weightedBeliefSum / Math.max(weightedConfidenceSum, 0.001) : 0.5;
        const graphConfidence = totalWeight > 0 ? weightedConfidenceSum / totalWeight : 0;
        // Constitutional adjustment: deviation from neutral (0.5) scaled by confidence.
        // Positive = evidence leans toward YES probability being higher than raw model thinks.
        // Negative = evidence leans toward NO / model is overconfident.
        const constitutionalAdjustment = (avgBelief - 0.5) * graphConfidence * 0.18;
        const payload = {
            contractId,
            nodes,
            constitutionalAdjustment,
            graphConfidence,
            timestamp,
        };
        this.bus.emit(EVENTS.BELIEF_GRAPH_UPDATE, payload);
    }
    clamp(v, lo = 0.01, hi = 0.99) {
        return Math.max(lo, Math.min(hi, v));
    }
}
