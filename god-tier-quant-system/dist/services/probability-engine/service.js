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
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            this.latestMicro.set(event.contractId, event);
        });
        this.bus.on(EVENTS.BELIEF_GRAPH_UPDATE, (event) => {
            this.latestBelief.set(event.contractId, event);
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
            // Apply constitutional adjustment from the belief graph when available.
            const belief = this.latestBelief.get(feature.contractId);
            const constitutional = belief
                ? Math.max(0.01, Math.min(0.99, calibrated + belief.constitutionalAdjustment))
                : calibrated;
            const output = {
                contractId: feature.contractId,
                estimatedProbability: constitutional,
                marketImpliedProbability: feature.impliedProbability,
                edge: constitutional - feature.impliedProbability,
                confidenceInterval: logistic.confidenceInterval,
                uncertaintyScore: belief ? logistic.uncertainty * (1 - belief.graphConfidence * 0.2) : logistic.uncertainty,
                calibrationError: this.calibration.expectedCalibrationError(),
                brierScore: this.calibration.brierScore(),
                regime: inferredRegime,
                timestamp: feature.timestamp,
            };
            this.prior.set(feature.contractId, constitutional);
            this.bus.emit(EVENTS.PROBABILITY, output);
        });
    }
}
