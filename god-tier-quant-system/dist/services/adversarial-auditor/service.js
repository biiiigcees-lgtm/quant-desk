import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const ADVERSE_REGIMES = new Set(['choppy', 'low-liquidity']);
export class AdversarialAuditorService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
        this.latest = new Map();
    }
    start() {
        this.bus.on(EVENTS.PROBABILITY, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.edge = e.edge;
            s.calibrationError = e.calibrationError;
            s.regime = e.regime;
        }, 'AdversarialAuditor.probability'));
        this.bus.on(EVENTS.BELIEF_GRAPH_UPDATE, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.beliefAdjustment = e.constitutionalAdjustment;
            s.graphConfidence = e.graphConfidence;
        }, 'AdversarialAuditor.beliefGraph'));
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.signalDirection = e.direction === 'YES' ? 1 : e.direction === 'NO' ? -1 : 0;
        }, 'AdversarialAuditor.signal'));
        this.bus.on(EVENTS.REALITY_SNAPSHOT, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.systemState = e.systemState;
            s.anomalyFactor = e.anomalyFactor;
        }, 'AdversarialAuditor.reality'));
        this.bus.on(EVENTS.EXECUTION_PLAN, safeHandler((e) => {
            this.audit(e.contractId, e.executionId);
        }, 'AdversarialAuditor.executionPlan'));
    }
    getLatestAudit(contractId) {
        return this.latest.get(contractId);
    }
    getOrCreate(contractId) {
        if (!this.state.has(contractId)) {
            this.state.set(contractId, {
                edge: 0, calibrationError: 0, beliefAdjustment: 0,
                graphConfidence: 0.5, regime: 'choppy', systemState: 'nominal',
                anomalyFactor: 1.0, signalDirection: 0,
            });
        }
        return this.state.get(contractId);
    }
    audit(contractId, executionId) {
        const s = this.getOrCreate(contractId);
        const weakAssumptions = [];
        const contradictingEvidence = [];
        const overconfidenceFlags = [];
        if (s.graphConfidence < 0.5) {
            weakAssumptions.push(`belief graph confidence low: ${s.graphConfidence.toFixed(2)}`);
        }
        if (s.calibrationError > 0.15) {
            weakAssumptions.push(`calibration error elevated: ${s.calibrationError.toFixed(3)}`);
        }
        if (s.edge > 0 && s.signalDirection <= 0) {
            contradictingEvidence.push(`model edge=${s.edge.toFixed(3)} but signal direction is not YES`);
        }
        if (s.systemState !== 'nominal') {
            contradictingEvidence.push(`reality layer in ${s.systemState} state`);
        }
        if (s.edge > 0.03 && s.calibrationError > 0.15) {
            overconfidenceFlags.push(`high edge=${s.edge.toFixed(3)} under poor calibration=${s.calibrationError.toFixed(3)}`);
        }
        if (s.anomalyFactor < 0.5) {
            overconfidenceFlags.push(`anomaly suppressing confidence (factor=${s.anomalyFactor.toFixed(2)})`);
        }
        const hiddenRegimeRisk = ADVERSE_REGIMES.has(s.regime);
        if (hiddenRegimeRisk) {
            weakAssumptions.push(`adverse regime detected: ${s.regime}`);
        }
        const adversarialScore = Math.min(1, weakAssumptions.length * 0.2 +
            contradictingEvidence.length * 0.3 +
            overconfidenceFlags.length * 0.25 +
            (hiddenRegimeRisk ? 0.25 : 0));
        const parts = [];
        if (hiddenRegimeRisk)
            parts.push(`regime mismatch (${s.regime})`);
        if (overconfidenceFlags.length > 0)
            parts.push('model overconfidence detected');
        if (contradictingEvidence.length > 0)
            parts.push(`${contradictingEvidence.length} signal(s) contradict plan`);
        if (weakAssumptions.length > 0)
            parts.push(`${weakAssumptions.length} weak assumption(s)`);
        const counterNarrative = parts.length > 0 ? parts.join('; ') : 'no material adversarial case identified';
        const event = {
            contractId,
            ...(executionId !== undefined ? { targetExecutionId: executionId } : {}),
            weakAssumptions,
            contradictingEvidence,
            overconfidenceFlags,
            hiddenRegimeRisk,
            adversarialScore: Number(adversarialScore.toFixed(4)),
            counterNarrative,
            timestamp: Date.now(),
        };
        this.latest.set(contractId, event);
        this.bus.emit(EVENTS.ADVERSARIAL_AUDIT, event);
    }
}
