import { EVENTS } from '../../core/event-bus/events.js';
import { BayesianLayer } from './bayesian-layer.js';
import { CalibrationLayer } from './calibration-layer.js';
import { LogisticLayer } from './logistic-layer.js';
import { RegimeAdjuster } from './regime-adjuster.js';
export class ProbabilityEngine {
    constructor(bus) {
        this.bus = bus;
        this.bayesian = new BayesianLayer();
        this.logistic = new LogisticLayer();
        this.regime = new RegimeAdjuster();
        this.calibration = new CalibrationLayer();
        this.latestMicro = new Map();
        this.prior = new Map();
        this.latestBelief = new Map();
        this.latestSystemBelief = new Map();
        this.latestPhysics = new Map();
        this.latestScenario = new Map();
        this.latestFeedIntegrity = new Map();
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            this.latestMicro.set(event.contractId, event);
        });
        this.bus.on(EVENTS.BELIEF_GRAPH_UPDATE, (event) => {
            this.latestBelief.set(event.contractId, event);
        });
        this.bus.on(EVENTS.SYSTEM_BELIEF_UPDATE, (event) => {
            this.latestSystemBelief.set(event.contractId, event);
        });
        this.bus.on(EVENTS.MARKET_PHYSICS, (event) => {
            this.latestPhysics.set(event.contractId, event);
        });
        this.bus.on(EVENTS.SCENARIO_BRANCH_STATE, (event) => {
            this.latestScenario.set(event.contractId, event);
        });
        this.bus.on(EVENTS.MARKET_DATA_INTEGRITY, (event) => {
            this.latestFeedIntegrity.set(event.contractId, event);
        });
        this.bus.on(EVENTS.FEATURES, (feature) => {
            const micro = this.latestMicro.get(feature.contractId);
            if (!micro)
                return;
            const prior = this.prior.get(feature.contractId) ?? feature.impliedProbability;
            const posterior = this.bayesian.updateProbability(prior, feature);
            const logistic = this.logistic.infer(feature);
            const rawBlend = posterior * 0.55 + logistic.probability * 0.45;
            const inferredRegime = this.regime.inferRegime(feature, micro);
            const adjusted = this.regime.adjustProbability(rawBlend, inferredRegime);
            const calibrated = this.calibration.calibrate(adjusted);
            // Apply constitutional adjustment from the system belief engine (fallback to legacy belief graph).
            const belief = this.latestBelief.get(feature.contractId);
            const systemBelief = this.latestSystemBelief.get(feature.contractId);
            const physics = this.latestPhysics.get(feature.contractId);
            const scenario = this.latestScenario.get(feature.contractId);
            const constitutionalAdjustment = systemBelief?.constitutionalAdjustment
                ?? belief?.constitutionalAdjustment
                ?? 0;
            const constitutional = clamp(calibrated + constitutionalAdjustment, 0.01, 0.99);
            const dominantBranchScore = scenario
                ? scenario.branchScores[scenario.dominantBranch] ?? 0.5
                : 0.5;
            const physicsAdjustment = physics
                ? clamp((physics.compression - physics.expansion) * 0.04 - physics.structuralStress * 0.05, -0.08, 0.08)
                : 0;
            let scenarioAdjustment = 0;
            if (scenario) {
                const invalidationPenalty = scenario.invalidated ? 0.035 : 0;
                scenarioAdjustment = clamp((dominantBranchScore - 0.5) * 0.05 - invalidationPenalty, -0.07, 0.07);
            }
            const rawEstimate = clamp(constitutional + physicsAdjustment + scenarioAdjustment, 0.01, 0.99);
            const feedIntegrity = this.latestFeedIntegrity.get(feature.contractId);
            const integrityPenalty = feedIntegrity ? clamp(1 - feedIntegrity.healthScore, 0, 0.45) : 0;
            const finalEstimate = clamp(rawEstimate * (1 - integrityPenalty) + feature.impliedProbability * integrityPenalty, 0.01, 0.99);
            const legacyBeliefConfidence = belief?.graphConfidence;
            const systemBeliefConfidence = systemBelief?.belief.selfAssessment.confidenceInBelief;
            const confidenceSignal = systemBeliefConfidence ?? legacyBeliefConfidence;
            const confidencePenalty = systemBelief?.confidencePenalty ?? 0;
            const hasConfidenceSignal = confidenceSignal !== undefined;
            const uncertaintyBase = hasConfidenceSignal
                ? logistic.uncertainty * (1 - confidenceSignal * 0.2)
                : logistic.uncertainty;
            const uncertaintyScore = clamp(uncertaintyBase +
                confidencePenalty * 0.4 +
                (physics?.structuralStress ?? 0) * 0.2 +
                (scenario?.volatilityWeight ?? 0) * 0.25 +
                (scenario?.invalidated ? 0.1 : 0) +
                integrityPenalty * 0.5 +
                (feedIntegrity?.degraded ? 0.08 : 0), 0, 1);
            const output = {
                contractId: feature.contractId,
                estimatedProbability: finalEstimate,
                marketImpliedProbability: feature.impliedProbability,
                edge: finalEstimate - feature.impliedProbability,
                confidenceInterval: logistic.confidenceInterval,
                uncertaintyScore,
                calibrationError: this.calibration.expectedCalibrationError(),
                brierScore: this.calibration.brierScore(),
                regime: inferredRegime,
                timestamp: feature.timestamp,
            };
            this.prior.set(feature.contractId, finalEstimate);
            this.bus.emit(EVENTS.PROBABILITY, output);
        });
    }
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
