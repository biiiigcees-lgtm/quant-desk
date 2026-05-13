import { EVENTS } from '../../core/event-bus/events.js';
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
function smooth(current, next, alpha) {
    const boundedAlpha = clamp(alpha, 0.01, 1);
    return current * (1 - boundedAlpha) + next * boundedAlpha;
}
export class SystemBeliefService {
    constructor(bus) {
        this.bus = bus;
        this.byContract = new Map();
        this.inputsByContract = new Map();
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            this.getInputs(event.contractId).microstructure = event;
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            this.getInputs(event.contractId).drift = event;
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            this.getInputs(event.contractId).anomaly = event;
        });
        this.bus.on(EVENTS.MARKET_DATA_INTEGRITY, (event) => {
            this.getInputs(event.contractId).integrity = event;
        });
        this.bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
            this.getInputs(event.contractId).lastDecision = event;
        });
        this.bus.on(EVENTS.DECISION_SNAPSHOT, (event) => {
            this.onSnapshot(event);
        });
        this.bus.on(EVENTS.REALITY_ALIGNMENT, (event) => {
            this.onOutcome(event);
        });
    }
    onSnapshot(snapshot) {
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
        const stateEvent = {
            contractId: snapshot.contractId,
            snapshot_id: snapshot.snapshot_id,
            market_state_hash: snapshot.market_state_hash,
            cycle_id: `${snapshot.contractId}:system-belief:${current.cycle}:${snapshot.timestamp}`,
            belief: nextBelief,
            timestamp: snapshot.timestamp,
        };
        const updateEvent = {
            contractId: snapshot.contractId,
            belief: nextBelief,
            constitutionalAdjustment,
            confidencePenalty,
            timestamp: snapshot.timestamp,
        };
        this.bus.emit(EVENTS.SYSTEM_BELIEF_STATE, stateEvent);
        this.bus.emit(EVENTS.SYSTEM_BELIEF_UPDATE, updateEvent);
    }
    onOutcome(event) {
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
        const reliability = smooth(state.belief.selfAssessment.reliabilityScore, 1 - directionalError, 0.12);
        const calibrationDrift = smooth(state.belief.selfAssessment.calibrationDrift, event.totalError, 0.2);
        state.belief.selfAssessment.reliabilityScore = clamp(reliability, 0, 1);
        state.belief.selfAssessment.calibrationDrift = clamp(calibrationDrift, 0, 1);
        state.belief.selfAssessment.confidenceInBelief = clamp(state.belief.selfAssessment.confidenceInBelief * (1 - state.belief.selfAssessment.calibrationDrift * 0.2), 0, 1);
        const outcomeEvent = {
            contractId: event.contractId,
            observedOutcome: event.actualOutcome,
            expectedDirection,
            directionalError,
            reliabilityScore: state.belief.selfAssessment.reliabilityScore,
            calibrationDrift: state.belief.selfAssessment.calibrationDrift,
            timestamp: event.timestamp,
        };
        const updateEvent = {
            contractId: event.contractId,
            belief: state.belief,
            constitutionalAdjustment: this.deriveConstitutionalAdjustment(state.belief),
            confidencePenalty: this.deriveConfidencePenalty(state.belief),
            timestamp: event.timestamp,
        };
        this.bus.emit(EVENTS.SYSTEM_BELIEF_OUTCOME, outcomeEvent);
        this.bus.emit(EVENTS.SYSTEM_BELIEF_UPDATE, updateEvent);
    }
    updateBelief(current, snapshot, inputs) {
        const p = snapshot.state.probability.estimatedProbability;
        const edge = snapshot.state.probability.edge;
        const regimeData = this.calculateRegimeData(snapshot, inputs);
        const structuralData = this.calculateStructuralData(snapshot, inputs);
        const biasData = this.calculateBiasData(p, current, regimeData.nextRegimeStability);
        const behavioralData = this.calculateBehavioralData(snapshot, inputs, edge);
        const assessmentData = this.calculateAssessmentData(snapshot, inputs, edge);
        return this.buildBeliefState(current, regimeData, structuralData, biasData, behavioralData, assessmentData);
    }
    calculateRegimeData(snapshot, inputs) {
        const regime = snapshot.state.probability.regime;
        const edge = snapshot.state.probability.edge;
        const drift = inputs.drift;
        const anomaly = inputs.anomaly;
        const isChop = regime === 'choppy' || regime === 'compression';
        const isReversal = !isChop && regime === 'reversal-prone';
        const isBreakout = !isChop && !isReversal && (regime === 'momentum-ignition' || regime === 'expansion');
        const nextRegimeType = isChop ? 'chop' : (isReversal ? 'reversal' : (isBreakout ? 'breakout' : 'trend'));
        const nextRegimeProbability = clamp(0.5 + Math.abs(edge) * 1.5 - (drift?.severity === 'high' ? 0.2 : drift?.severity === 'medium' ? 0.1 : 0), 0, 1);
        const nextRegimeStability = clamp(1 - (drift?.psi ?? 0) * 0.6 - (anomaly?.confidenceDegradation ?? 0) * 0.4, 0, 1);
        return { nextRegimeType, nextRegimeProbability, nextRegimeStability };
    }
    calculateStructuralData(snapshot, inputs) {
        const micro = inputs.microstructure;
        const integrity = inputs.integrity;
        const anomaly = inputs.anomaly;
        const uncertainty = snapshot.state.probability.uncertaintyScore;
        const isThinLiquidity = micro?.liquidityRegime === 'vacuum' || (integrity?.healthScore ?? 1) < 0.45;
        const isNormalLiquidity = !isThinLiquidity && micro?.liquidityRegime === 'thin';
        const nextLiquidity = isThinLiquidity ? 'thin' : (isNormalLiquidity ? 'normal' : 'dense');
        const isHighVol = uncertainty > 0.65;
        const isMediumVol = !isHighVol && uncertainty > 0.35;
        const nextVolRegime = isHighVol ? 'high' : (isMediumVol ? 'medium' : 'low');
        const nextManipulationRisk = clamp((micro?.spoofProbability ?? 0) * 0.5 + (anomaly?.confidenceDegradation ?? 0) * 0.3 + (1 - (integrity?.healthScore ?? 1)) * 0.2, 0, 1);
        return { nextLiquidity, nextVolRegime, nextManipulationRisk };
    }
    calculateBiasData(p, current, regimeStability) {
        const isBullish = p > 0.55;
        const isBearish = !isBullish && p < 0.45;
        const nextBias = isBullish ? 'bullish' : (isBearish ? 'bearish' : 'neutral');
        const nextBiasStrength = clamp(Math.abs(p - 0.5) * 2, 0, 1);
        const nextPersistence = clamp(current.directionalBiasModel.persistence * 0.8 + regimeStability * 0.2, 0, 1);
        return { nextBias, nextBiasStrength, nextPersistence };
    }
    calculateBehavioralData(snapshot, inputs, edge) {
        const micro = inputs.microstructure;
        const anomaly = inputs.anomaly;
        const uncertainty = snapshot.state.probability.uncertaintyScore;
        const expectedVolatility = clamp((uncertainty * 0.55) + (micro?.spreadExpansionScore ?? 0) * 0.25 + (anomaly ? 0.2 : 0), 0, 1);
        const expectedDrift = clamp(edge * 8, -1, 1);
        const expectedMomentum = clamp((micro?.obiVelocity ?? 0) * 0.5 + (micro?.aggressionScore ?? 0) * 0.5, -1, 1);
        return { expectedVolatility, expectedDrift, expectedMomentum };
    }
    calculateAssessmentData(snapshot, inputs, edge) {
        const drift = inputs.drift;
        const uncertainty = snapshot.state.probability.uncertaintyScore;
        const calibError = snapshot.state.probability.calibrationError;
        const lastDecision = inputs.lastDecision;
        const reliabilityTarget = clamp(1 - uncertainty * 0.4 - (drift?.severity === 'high' ? 0.2 : 0), 0, 1);
        const calibrationTarget = clamp(calibError + (drift?.psi ?? 0) * 0.15, 0, 1);
        const decisionConfidence = lastDecision?.confidence_score ?? 0.5;
        const confidenceTarget = clamp(reliabilityTarget * (1 - calibrationTarget) * (0.8 + decisionConfidence * 0.2), 0, 1);
        return { reliabilityTarget, calibrationTarget, confidenceTarget };
    }
    buildBeliefState(current, regimeData, structuralData, biasData, behavioralData, assessmentData) {
        return {
            regimeHypothesis: {
                type: regimeData.nextRegimeType,
                probability: clamp(smooth(current.regimeHypothesis.probability, regimeData.nextRegimeProbability, 0.2), 0, 1),
                stability: clamp(smooth(current.regimeHypothesis.stability, regimeData.nextRegimeStability, 0.15), 0, 1),
            },
            structuralMarketState: {
                liquidityCondition: structuralData.nextLiquidity,
                volatilityRegime: structuralData.nextVolRegime,
                manipulationRisk: clamp(smooth(current.structuralMarketState.manipulationRisk, structuralData.nextManipulationRisk, 0.2), 0, 1),
            },
            directionalBiasModel: {
                bias: biasData.nextBias,
                strength: clamp(smooth(current.directionalBiasModel.strength, biasData.nextBiasStrength, 0.25), 0, 1),
                persistence: clamp(smooth(current.directionalBiasModel.persistence, biasData.nextPersistence, 0.15), 0, 1),
            },
            behavioralExpectation: {
                expectedVolatility: clamp(smooth(current.behavioralExpectation.expectedVolatility, behavioralData.expectedVolatility, 0.2), 0, 1),
                expectedDrift: clamp(smooth(current.behavioralExpectation.expectedDrift, behavioralData.expectedDrift, 0.2), -1, 1),
                expectedMomentum: clamp(smooth(current.behavioralExpectation.expectedMomentum, behavioralData.expectedMomentum, 0.2), -1, 1),
            },
            selfAssessment: {
                confidenceInBelief: clamp(smooth(current.selfAssessment.confidenceInBelief, assessmentData.confidenceTarget, 0.2), 0, 1),
                calibrationDrift: clamp(smooth(current.selfAssessment.calibrationDrift, assessmentData.calibrationTarget, 0.18), 0, 1),
                reliabilityScore: clamp(smooth(current.selfAssessment.reliabilityScore, assessmentData.reliabilityTarget, 0.18), 0, 1),
            },
        };
    }
    deriveConstitutionalAdjustment(belief) {
        const isBullish = belief.directionalBiasModel.bias === 'bullish';
        const isBearish = !isBullish && belief.directionalBiasModel.bias === 'bearish';
        const direction = isBullish ? 1 : (isBearish ? -1 : 0);
        const signal = direction * belief.directionalBiasModel.strength * belief.directionalBiasModel.persistence;
        const trust = belief.selfAssessment.reliabilityScore * (1 - belief.selfAssessment.calibrationDrift);
        const structuralPenalty = belief.structuralMarketState.manipulationRisk * 0.4;
        return clamp(signal * trust * (1 - structuralPenalty) * 0.08, -0.1, 0.1);
    }
    deriveConfidencePenalty(belief) {
        const volatilityPenalty = belief.behavioralExpectation.expectedVolatility * 0.25;
        const structuralPenalty = belief.structuralMarketState.manipulationRisk * 0.35;
        const calibrationPenalty = belief.selfAssessment.calibrationDrift * 0.3;
        return clamp(volatilityPenalty + structuralPenalty + calibrationPenalty, 0, 0.8);
    }
    getOrCreate(contractId) {
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
    getInputs(contractId) {
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
