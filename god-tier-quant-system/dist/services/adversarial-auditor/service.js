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
        this.bus.on(EVENTS.SYSTEM_BELIEF_UPDATE, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.beliefAdjustment = e.constitutionalAdjustment;
            s.graphConfidence = e.belief.selfAssessment.reliabilityScore;
            s.confidencePenalty = e.confidencePenalty;
        }, 'AdversarialAuditor.systemBelief'));
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.signalDirection = e.direction === 'YES' ? 1 : (e.direction === 'NO' ? -1 : 0);
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
                graphConfidence: 0.5, confidencePenalty: 0,
                regime: 'choppy', systemState: 'nominal',
                anomalyFactor: 1, signalDirection: 0,
            });
        }
        return this.state.get(contractId);
    }
    audit(contractId, executionId) {
        const s = this.getOrCreate(contractId);
        const weakAssumptions = this.checkWeakAssumptions(s);
        const contradictingEvidence = this.checkContradictingEvidence(s);
        const overconfidenceFlags = this.checkOverconfidence(s);
        const hiddenRegimeRisk = ADVERSE_REGIMES.has(s.regime);
        if (hiddenRegimeRisk) {
            weakAssumptions.push(`adverse regime detected: ${s.regime}`);
        }
        const adversarialScore = Math.min(1, weakAssumptions.length * 0.2 +
            contradictingEvidence.length * 0.3 +
            overconfidenceFlags.length * 0.25 +
            (hiddenRegimeRisk ? 0.25 : 0));
        const counterNarrative = this.buildCounterNarrative(hiddenRegimeRisk, overconfidenceFlags, contradictingEvidence, weakAssumptions);
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
    checkWeakAssumptions(s) {
        const assumptions = [];
        if (s.graphConfidence < 0.5) {
            assumptions.push(`belief graph confidence low: ${s.graphConfidence.toFixed(2)}`);
        }
        if (s.calibrationError > 0.15) {
            assumptions.push(`calibration error elevated: ${s.calibrationError.toFixed(3)}`);
        }
        return assumptions;
    }
    checkContradictingEvidence(s) {
        const evidence = [];
        if (s.edge > 0 && s.signalDirection <= 0) {
            evidence.push(`model edge=${s.edge.toFixed(3)} but signal direction is not YES`);
        }
        if (s.systemState !== 'nominal') {
            evidence.push(`reality layer in ${s.systemState} state`);
        }
        return evidence;
    }
    checkOverconfidence(s) {
        const flags = [];
        if (s.edge > 0.03 && s.calibrationError > 0.15) {
            flags.push(`high edge=${s.edge.toFixed(3)} under poor calibration=${s.calibrationError.toFixed(3)}`);
        }
        if (s.anomalyFactor < 0.5) {
            flags.push(`anomaly suppressing confidence (factor=${s.anomalyFactor.toFixed(2)})`);
        }
        if (s.confidencePenalty > 0.35) {
            flags.push(`system belief confidence penalty elevated (${s.confidencePenalty.toFixed(2)})`);
        }
        return flags;
    }
    buildCounterNarrative(hiddenRisk, overconfidence, evidence, weak) {
        const parts = [];
        if (hiddenRisk)
            parts.push(`regime mismatch (${ADVERSE_REGIMES.has('choppy') ? 'choppy' : 'unknown'})`);
        if (overconfidence.length > 0)
            parts.push('model overconfidence detected');
        if (evidence.length > 0)
            parts.push(`${evidence.length} signal(s) contradict plan`);
        if (weak.length > 0)
            parts.push(`${weak.length} weak assumption(s)`);
        return parts.length > 0 ? parts.join('; ') : 'no material adversarial case identified';
    }
}
