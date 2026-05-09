import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { BeliefGraphEvent, FeatureEvent, MicrostructureEvent, ProbabilityEvent } from '../../core/schemas/events.js';
import { BayesianLayer } from './bayesian-layer.js';
import { CalibrationLayer } from './calibration-layer.js';
import { LogisticLayer } from './logistic-layer.js';
import { RegimeAdjuster } from './regime-adjuster.js';

export class ProbabilityEngine {
  private readonly bayesian = new BayesianLayer();
  private readonly logistic = new LogisticLayer();
  private readonly regime = new RegimeAdjuster();
  private readonly calibration = new CalibrationLayer();
  private readonly latestMicro: Map<string, MicrostructureEvent> = new Map();
  private readonly prior: Map<string, number> = new Map();
  private readonly latestBelief: Map<string, BeliefGraphEvent> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, (event) => {
      this.latestMicro.set(event.contractId, event);
    });

    this.bus.on<BeliefGraphEvent>(EVENTS.BELIEF_GRAPH_UPDATE, (event) => {
      this.latestBelief.set(event.contractId, event);
    });

    this.bus.on<FeatureEvent>(EVENTS.FEATURES, (feature) => {
      const micro = this.latestMicro.get(feature.contractId);
      if (!micro) return;

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

      const output: ProbabilityEvent = {
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
