import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const DRIFT_UNCERTAINTY = { none: 0.0, low: 0.15, medium: 0.4, high: 0.7 };
const ANOMALY_UNCERTAINTY = { none: 0.0, low: 0.2, medium: 0.45, high: 0.75, critical: 1.0 };
export class SystemConsciousnessService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
        this.latest = new Map();
    }
    start() {
        this.bus.on(EVENTS.PROBABILITY, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.probability = e.estimatedProbability;
            s.edge = e.edge;
            s.ece = e.calibrationError;
            s.timestamp = e.timestamp;
            this.emit(e.contractId);
        }, 'SystemConsciousness.probability'));
        this.bus.on(EVENTS.BELIEF_GRAPH_UPDATE, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.beliefAdjustment = e.constitutionalAdjustment;
            s.graphConfidence = e.graphConfidence;
            s.timestamp = e.timestamp;
            this.emit(e.contractId);
        }, 'SystemConsciousness.beliefGraph'));
        this.bus.on(EVENTS.REALITY_SNAPSHOT, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.truthScore = e.truthScore;
            s.driftFactor = DRIFT_UNCERTAINTY[e.uncertaintyState] ?? 0.0;
            s.anomalyFactor = e.anomalyFactor;
            s.timestamp = e.timestamp;
            this.emit(e.contractId);
        }, 'SystemConsciousness.reality'));
        this.bus.on(EVENTS.ANOMALY, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.anomalyFactor = ANOMALY_UNCERTAINTY[e.severity] ?? 0.0;
            s.timestamp = e.timestamp;
            this.emit(e.contractId);
        }, 'SystemConsciousness.anomaly'));
        this.bus.on(EVENTS.CALIBRATION_UPDATE, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.ece = e.ece;
            s.timestamp = e.timestamp;
            this.emit(e.contractId);
        }, 'SystemConsciousness.calibration'));
        this.bus.on(EVENTS.CAUSAL_INSIGHT, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.totalInsights += 1;
            if (e.spurious)
                s.spuriousInsights += 1;
            s.timestamp = e.timestamp;
            this.emit(e.contractId);
        }, 'SystemConsciousness.causal'));
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.signalDirection = e.direction === 'YES' ? 1 : e.direction === 'NO' ? -1 : 0;
            s.timestamp = e.timestamp;
            this.emit(e.contractId);
        }, 'SystemConsciousness.signal'));
    }
    getLatestConsciousness(contractId) {
        return this.latest.get(contractId);
    }
    getOrCreate(contractId) {
        if (!this.state.has(contractId)) {
            this.state.set(contractId, {
                probability: 0.5, edge: 0, beliefAdjustment: 0, graphConfidence: 0.5,
                ece: 0, driftFactor: 0, anomalyFactor: 0, truthScore: 0.5,
                signalDirection: 0, spuriousInsights: 0, totalInsights: 0,
                contradictions: [], contractId, timestamp: Date.now(),
            });
        }
        return this.state.get(contractId);
    }
    detectContradictions(s) {
        const found = [...s.contradictions];
        if (Math.abs(s.edge) > 0.02 && s.truthScore < 0.45) {
            const desc = `edge=${s.edge.toFixed(3)} but truthScore=${s.truthScore.toFixed(3)}`;
            if (!found.slice(0, 5).some((c) => c.description === desc)) {
                found.unshift({ source: 'probability', target: 'reality', description: desc });
            }
        }
        if (s.beliefAdjustment < -0.05 && s.signalDirection > 0) {
            const desc = `beliefAdj=${s.beliefAdjustment.toFixed(3)} opposes YES signal`;
            if (!found.slice(0, 5).some((c) => c.description === desc)) {
                found.unshift({ source: 'belief-graph', target: 'signal', description: desc });
            }
        }
        if (s.ece > 0.20 && Math.abs(s.edge) > 0.03) {
            const desc = `ece=${s.ece.toFixed(3)} but edge=${s.edge.toFixed(3)}`;
            if (!found.slice(0, 5).some((c) => c.description === desc)) {
                found.unshift({ source: 'calibration', target: 'edge', description: desc });
            }
        }
        return found.slice(0, 10);
    }
    emit(contractId) {
        const s = this.state.get(contractId);
        if (!s)
            return;
        s.contradictions = this.detectContradictions(s);
        const calibrationHealth = Math.max(0, Math.min(1, 1 - s.ece * 5));
        const driftH = Math.max(0, 1 - s.driftFactor);
        const anomalyH = Math.max(0, 1 - s.anomalyFactor);
        const beliefUncertainty = Math.max(0, 1 - s.graphConfidence);
        const uncertaintyTopology = {
            calibration: Number((1 - calibrationHealth).toFixed(4)),
            drift: Number(s.driftFactor.toFixed(4)),
            anomaly: Number(s.anomalyFactor.toFixed(4)),
            belief: Number(beliefUncertainty.toFixed(4)),
            composite: Number(((1 - calibrationHealth) * 0.35 +
                s.driftFactor * 0.25 +
                s.anomalyFactor * 0.25 +
                beliefUncertainty * 0.15).toFixed(4)),
        };
        const contradictionDensity = Number((s.spuriousInsights / Math.max(1, s.totalInsights)).toFixed(4));
        const compositeUncertainty = uncertaintyTopology.composite;
        const stress = contradictionDensity * 0.4 + compositeUncertainty * 0.6;
        const cognitiveStressState = stress > 0.70 ? 'critical' : stress > 0.40 ? 'stressed' : 'stable';
        const event = {
            contractId,
            beliefState: {
                probability: Number(s.probability.toFixed(4)),
                confidence: Number(s.graphConfidence.toFixed(4)),
                beliefAdjustment: Number(s.beliefAdjustment.toFixed(4)),
            },
            uncertaintyTopology,
            contradictionDensity,
            contradictions: s.contradictions.map((c) => ({ ...c })),
            cognitiveStressState,
            timestamp: s.timestamp,
        };
        this.latest.set(contractId, event);
        this.bus.emit(EVENTS.SYSTEM_CONSCIOUSNESS, event);
    }
}
