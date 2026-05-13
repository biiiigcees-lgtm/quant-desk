import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  AnomalyEvent,
  ConstitutionalDecisionEvent,
  DecisionSnapshotEvent,
  DriftEvent,
  MarketDataIntegrityEvent,
  MicrostructureEvent,
  RealityAlignmentEvent,
  SystemBeliefOutcomeEvent,
  SystemBeliefStateEvent,
  SystemBeliefUpdateEvent,
  SystemBeliefV2,
} from '../../core/schemas/events.js';

interface ContractBeliefState {
  belief: SystemBeliefV2;
  cycle: number;
  snapshotId: string;
  marketStateHash: string;
  lastConstitutionalAdjustment: number;
  lastConfidencePenalty: number;
}

interface ContractInputs {
  microstructure: MicrostructureEvent | null;
  drift: DriftEvent | null;
  anomaly: AnomalyEvent | null;
  integrity: MarketDataIntegrityEvent | null;
  lastDecision: ConstitutionalDecisionEvent | null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function smooth(current: number, next: number, alpha: number): number {
  const boundedAlpha = clamp(alpha, 0.01, 1);
  return current * (1 - boundedAlpha) + next * boundedAlpha;
}

export class SystemBeliefService {
  private readonly byContract = new Map<string, ContractBeliefState>();
  private readonly inputsByContract = new Map<string, ContractInputs>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, (event) => {
      this.getInputs(event.contractId).microstructure = event;
    });

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, (event) => {
      this.getInputs(event.contractId).drift = event;
    });

    this.bus.on<AnomalyEvent>(EVENTS.ANOMALY, (event) => {
      this.getInputs(event.contractId).anomaly = event;
    });

    this.bus.on<MarketDataIntegrityEvent>(EVENTS.MARKET_DATA_INTEGRITY, (event) => {
      this.getInputs(event.contractId).integrity = event;
    });

    this.bus.on<ConstitutionalDecisionEvent>(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
      this.getInputs(event.contractId).lastDecision = event;
    });

    this.bus.on<DecisionSnapshotEvent>(EVENTS.DECISION_SNAPSHOT, (event) => {
      this.onSnapshot(event);
    });

    this.bus.on<RealityAlignmentEvent>(EVENTS.REALITY_ALIGNMENT, (event) => {
      this.onOutcome(event);
    });
  }

  private onSnapshot(snapshot: DecisionSnapshotEvent): void {
    const current = this.getOrCreate(snapshot.contractId);
    const inputs = this.getInputs(snapshot.contractId);
    const nextBelief = this.updateBelief(current.belief, snapshot, inputs);

    current.belief = nextBelief;
    current.cycle += 1;
    current.snapshotId = snapshot.snapshot_id;
    current.marketStateHash = snapshot.market_state_hash;

    const constitutionalAdjustment = this.deriveConstitutionalAdjustment(nextBelief);
    const confidencePenalty = this.deriveConfidencePenalty(nextBelief);

    current.lastConstitutionalAdjustment = constitutionalAdjustment;
    current.lastConfidencePenalty = confidencePenalty;

    const stateEvent: SystemBeliefStateEvent = {
      contractId: snapshot.contractId,
      snapshot_id: snapshot.snapshot_id,
      market_state_hash: snapshot.market_state_hash,
      cycle_id: `${snapshot.contractId}:system-belief:${current.cycle}:${snapshot.timestamp}`,
      belief: nextBelief,
      timestamp: snapshot.timestamp,
    };

    const updateEvent: SystemBeliefUpdateEvent = {
      contractId: snapshot.contractId,
      belief: nextBelief,
      constitutionalAdjustment,
      confidencePenalty,
      timestamp: snapshot.timestamp,
    };

    this.bus.emit<SystemBeliefStateEvent>(EVENTS.SYSTEM_BELIEF_STATE, stateEvent);
    this.bus.emit<SystemBeliefUpdateEvent>(EVENTS.SYSTEM_BELIEF_UPDATE, updateEvent);
  }

  private onOutcome(event: RealityAlignmentEvent): void {
    const state = this.byContract.get(event.contractId);
    if (!state || event.actualOutcome === 'UNKNOWN') {
      return;
    }

    const expectedDirection = state.belief.directionalBiasModel.bias;
    const observedDirection = event.actualOutcome === 'ABOVE' ? 'bullish' : 'bearish';
    const directionalError = expectedDirection === 'neutral'
      ? 0.5
      : expectedDirection === observedDirection
        ? 0
        : 1;

    const reliability = smooth(
      state.belief.selfAssessment.reliabilityScore,
      1 - directionalError,
      0.12,
    );
    const calibrationDrift = smooth(
      state.belief.selfAssessment.calibrationDrift,
      event.totalError,
      0.2,
    );

    state.belief.selfAssessment.reliabilityScore = clamp(reliability, 0, 1);
    state.belief.selfAssessment.calibrationDrift = clamp(calibrationDrift, 0, 1);
    state.belief.selfAssessment.confidenceInBelief = clamp(
      state.belief.selfAssessment.confidenceInBelief * (1 - state.belief.selfAssessment.calibrationDrift * 0.2),
      0,
      1,
    );

    const outcomeEvent: SystemBeliefOutcomeEvent = {
      contractId: event.contractId,
      observedOutcome: event.actualOutcome,
      expectedDirection,
      directionalError,
      reliabilityScore: state.belief.selfAssessment.reliabilityScore,
      calibrationDrift: state.belief.selfAssessment.calibrationDrift,
      timestamp: event.timestamp,
    };

    const updateEvent: SystemBeliefUpdateEvent = {
      contractId: event.contractId,
      belief: state.belief,
      constitutionalAdjustment: this.deriveConstitutionalAdjustment(state.belief),
      confidencePenalty: this.deriveConfidencePenalty(state.belief),
      timestamp: event.timestamp,
    };

    this.bus.emit<SystemBeliefOutcomeEvent>(EVENTS.SYSTEM_BELIEF_OUTCOME, outcomeEvent);
    this.bus.emit<SystemBeliefUpdateEvent>(EVENTS.SYSTEM_BELIEF_UPDATE, updateEvent);
  }

  private updateBelief(
    current: SystemBeliefV2,
    snapshot: DecisionSnapshotEvent,
    inputs: ContractInputs,
  ): SystemBeliefV2 {
    const p = snapshot.state.probability.estimatedProbability;
    const edge = snapshot.state.probability.edge;
    const regime = snapshot.state.probability.regime;
    const drift = inputs.drift;
    const anomaly = inputs.anomaly;
    const integrity = inputs.integrity;
    const micro = inputs.microstructure;
    const lastDecision = inputs.lastDecision;

    const isChop = regime === 'choppy' || regime === 'compression';
    const isReversal = regime === 'reversal-prone';
    const isBreakout = regime === 'momentum-ignition' || regime === 'expansion';
    const nextRegimeType = isChop ? 'chop' : (isReversal ? 'reversal' : (isBreakout ? 'breakout' : 'trend'));

    const nextRegimeProbability = clamp(
      0.5 + Math.abs(edge) * 1.5 - (drift?.severity === 'high' ? 0.2 : drift?.severity === 'medium' ? 0.1 : 0),
      0,
      1,
    );

    const nextRegimeStability = clamp(
      1 - (drift?.psi ?? 0) * 0.6 - (anomaly?.confidenceDegradation ?? 0) * 0.4,
      0,
      1,
    );

    const isThinLiquidity = micro?.liquidityRegime === 'vacuum' || (integrity?.healthScore ?? 1) < 0.45;
    const isNormalLiquidity = micro?.liquidityRegime === 'thin';
    const nextLiquidity = isThinLiquidity ? 'thin' : (isNormalLiquidity ? 'normal' : 'dense');

    const isHighVol = snapshot.state.probability.uncertaintyScore > 0.65;
    const isMediumVol = snapshot.state.probability.uncertaintyScore > 0.35;
    const nextVolRegime = isHighVol ? 'high' : (isMediumVol ? 'medium' : 'low');

    const nextManipulationRisk = clamp(
      (micro?.spoofProbability ?? 0) * 0.5 + (anomaly?.confidenceDegradation ?? 0) * 0.3 + (1 - (integrity?.healthScore ?? 1)) * 0.2,
      0,
      1,
    );

    const isBullish = p > 0.55;
    const isBearish = p < 0.45;
    const nextBias = isBullish ? 'bullish' : (isBearish ? 'bearish' : 'neutral');
    const nextBiasStrength = clamp(Math.abs(p - 0.5) * 2, 0, 1);
    const nextPersistence = clamp(
      current.directionalBiasModel.persistence * 0.8 + nextRegimeStability * 0.2,
      0,
      1,
    );

    const expectedVolatility = clamp(
      (snapshot.state.probability.uncertaintyScore * 0.55) + (micro?.spreadExpansionScore ?? 0) * 0.25 + (anomaly ? 0.2 : 0),
      0,
      1,
    );
    const expectedDrift = clamp(edge * 8, -1, 1);
    const expectedMomentum = clamp((micro?.obiVelocity ?? 0) * 0.5 + (micro?.aggressionScore ?? 0) * 0.5, -1, 1);

    const reliabilityTarget = clamp(
      1 - snapshot.state.probability.uncertaintyScore * 0.4 - nextManipulationRisk * 0.3 - (drift?.severity === 'high' ? 0.2 : 0),
      0,
      1,
    );

    const calibrationTarget = clamp(
      snapshot.state.probability.calibrationError + (drift?.psi ?? 0) * 0.15,
      0,
      1,
    );

    const decisionConfidence = lastDecision?.confidence_score ?? 0.5;
    const confidenceTarget = clamp(
      reliabilityTarget * (1 - calibrationTarget) * (0.8 + decisionConfidence * 0.2),
      0,
      1,
    );

    return {
      regimeHypothesis: {
        type: nextRegimeType,
        probability: clamp(smooth(current.regimeHypothesis.probability, nextRegimeProbability, 0.2), 0, 1),
        stability: clamp(smooth(current.regimeHypothesis.stability, nextRegimeStability, 0.15), 0, 1),
      },
      structuralMarketState: {
        liquidityCondition: nextLiquidity,
        volatilityRegime: nextVolRegime,
        manipulationRisk: clamp(smooth(current.structuralMarketState.manipulationRisk, nextManipulationRisk, 0.2), 0, 1),
      },
      directionalBiasModel: {
        bias: nextBias,
        strength: clamp(smooth(current.directionalBiasModel.strength, nextBiasStrength, 0.25), 0, 1),
        persistence: clamp(smooth(current.directionalBiasModel.persistence, nextPersistence, 0.15), 0, 1),
      },
      behavioralExpectation: {
        expectedVolatility: clamp(smooth(current.behavioralExpectation.expectedVolatility, expectedVolatility, 0.2), 0, 1),
        expectedDrift: clamp(smooth(current.behavioralExpectation.expectedDrift, expectedDrift, 0.2), -1, 1),
        expectedMomentum: clamp(smooth(current.behavioralExpectation.expectedMomentum, expectedMomentum, 0.2), -1, 1),
      },
      selfAssessment: {
        confidenceInBelief: clamp(smooth(current.selfAssessment.confidenceInBelief, confidenceTarget, 0.2), 0, 1),
        calibrationDrift: clamp(smooth(current.selfAssessment.calibrationDrift, calibrationTarget, 0.18), 0, 1),
        reliabilityScore: clamp(smooth(current.selfAssessment.reliabilityScore, reliabilityTarget, 0.18), 0, 1),
      },
    };
  }

  private deriveConstitutionalAdjustment(belief: SystemBeliefV2): number {
    const direction =
      belief.directionalBiasModel.bias === 'bullish' ? 1
      : belief.directionalBiasModel.bias === 'bearish' ? -1
      : 0;

    const signal = direction * belief.directionalBiasModel.strength * belief.directionalBiasModel.persistence;
    const trust = belief.selfAssessment.reliabilityScore * (1 - belief.selfAssessment.calibrationDrift);
    const structuralPenalty = belief.structuralMarketState.manipulationRisk * 0.4;
    return clamp(signal * trust * (1 - structuralPenalty) * 0.08, -0.1, 0.1);
  }

  private deriveConfidencePenalty(belief: SystemBeliefV2): number {
    const volatilityPenalty = belief.behavioralExpectation.expectedVolatility * 0.25;
    const structuralPenalty = belief.structuralMarketState.manipulationRisk * 0.35;
    const calibrationPenalty = belief.selfAssessment.calibrationDrift * 0.3;
    return clamp(volatilityPenalty + structuralPenalty + calibrationPenalty, 0, 0.8);
  }

  private getOrCreate(contractId: string): ContractBeliefState {
    let state = this.byContract.get(contractId);
    if (!state) {
      state = {
        belief: {
          regimeHypothesis: {
            type: 'chop',
            probability: 0.5,
            stability: 0.45,
          },
          structuralMarketState: {
            liquidityCondition: 'normal',
            volatilityRegime: 'medium',
            manipulationRisk: 0.2,
          },
          directionalBiasModel: {
            bias: 'neutral',
            strength: 0,
            persistence: 0.4,
          },
          behavioralExpectation: {
            expectedVolatility: 0.5,
            expectedDrift: 0,
            expectedMomentum: 0,
          },
          selfAssessment: {
            confidenceInBelief: 0.5,
            calibrationDrift: 0.25,
            reliabilityScore: 0.6,
          },
        },
        cycle: 0,
        snapshotId: `init:${contractId}`,
        marketStateHash: 'init',
        lastConstitutionalAdjustment: 0,
        lastConfidencePenalty: 0.2,
      };
      this.byContract.set(contractId, state);
    }
    return state;
  }

  private getInputs(contractId: string): ContractInputs {
    let state = this.inputsByContract.get(contractId);
    if (!state) {
      state = {
        microstructure: null,
        drift: null,
        anomaly: null,
        integrity: null,
        lastDecision: null,
      };
      this.inputsByContract.set(contractId, state);
    }
    return state;
  }
}
