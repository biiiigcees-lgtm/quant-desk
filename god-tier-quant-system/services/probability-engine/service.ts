import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  BeliefGraphEvent,
  FeatureEvent,
  MarketDataIntegrityEvent,
  MarketPhysicsEvent,
  MicrostructureEvent,
  ProbabilityEvent,
  ScenarioBranchStateEvent,
} from '../../core/schemas/events.js';
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
  private readonly latestPhysics: Map<string, MarketPhysicsEvent> = new Map();
  private readonly latestScenario: Map<string, ScenarioBranchStateEvent> = new Map();
  private readonly latestFeedIntegrity: Map<string, MarketDataIntegrityEvent> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, (event) => {
      this.latestMicro.set(event.contractId, event);
    });

    this.bus.on<BeliefGraphEvent>(EVENTS.BELIEF_GRAPH_UPDATE, (event) => {
      this.latestBelief.set(event.contractId, event);
    });

    this.bus.on<MarketPhysicsEvent>(EVENTS.MARKET_PHYSICS, (event) => {
      this.latestPhysics.set(event.contractId, event);
    });

    this.bus.on<ScenarioBranchStateEvent>(EVENTS.SCENARIO_BRANCH_STATE, (event) => {
      this.latestScenario.set(event.contractId, event);
    });

    this.bus.on<MarketDataIntegrityEvent>(EVENTS.MARKET_DATA_INTEGRITY, (event) => {
      this.latestFeedIntegrity.set(event.contractId, event);
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
      const physics = this.latestPhysics.get(feature.contractId);
      const scenario = this.latestScenario.get(feature.contractId);
      const constitutional = belief
        ? Math.max(0.01, Math.min(0.99, calibrated + belief.constitutionalAdjustment))
        : calibrated;

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
      const finalEstimate = clamp(
        rawEstimate * (1 - integrityPenalty) + feature.impliedProbability * integrityPenalty,
        0.01,
        0.99,
      );

      const uncertaintyBase = belief ? logistic.uncertainty * (1 - belief.graphConfidence * 0.2) : logistic.uncertainty;
      const uncertaintyScore = clamp(
        uncertaintyBase +
          (physics?.structuralStress ?? 0) * 0.2 +
          (scenario?.volatilityWeight ?? 0) * 0.25 +
          (scenario?.invalidated ? 0.1 : 0) +
          integrityPenalty * 0.5 +
          (feedIntegrity?.degraded ? 0.08 : 0),
        0,
        1,
      );

      const output: ProbabilityEvent = {
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
