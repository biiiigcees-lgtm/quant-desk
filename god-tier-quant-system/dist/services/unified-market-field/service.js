import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const CONFIDENCE_THRESHOLD = 0.57;
const REGIME_INSTABILITY_HARD_STOP = 0.72;
const CAUSAL_ALIGNMENT_MIN = 0.35;
const DEFAULT_WEIGHTS = { liquidity: 0.25, flow: 0.35, volatility: 0.25, entropy: 0.15 };
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function emptyState() {
    return {
        micro: null, feat: null, gravity: null, filtered: null,
        regime: null, weights: { ...DEFAULT_WEIGHTS },
        adversarial: null, memory: null, multiscale: null,
    };
}
function computeFlowForce(micro) {
    // Net execution force = OBI weighted by aggression + sweep signal
    const obiComponent = micro.obi * 0.5;
    const sweepDirection = micro.obiVelocity >= 0 ? 1 : -1;
    const sweepComponent = sweepDirection * micro.sweepProbability * 0.3;
    const aggressionComponent = Math.sign(micro.obi) * micro.aggressionScore * 0.2;
    return clamp(obiComponent + sweepComponent + aggressionComponent, -1, 1);
}
function computeVolatilityForce(feat) {
    // Compressed energy direction: sign of momentum times scaled volatility
    const momentum = feat.probabilityVelocity;
    if (Math.abs(momentum) < 0.001)
        return 0;
    const scaled = clamp(Math.abs(momentum) * 20, 0, 1);
    return clamp(Math.sign(momentum) * scaled, -1, 1);
}
function computeEntropyPenalty(micro, feat, regime) {
    // High entropy = high disorder = penalty to conviction
    const spreadEntropy = micro.spreadExpansionScore * 0.3;
    const volatilityUncertainty = feat.volatility > 0.04 ? 0.3 : 0;
    const regimeInstability = regime ? regime.regimeInstability * 0.4 : 0.2;
    return clamp(spreadEntropy + volatilityUncertainty + regimeInstability, 0, 1);
}
function computeMemoryAdjustment(memory) {
    if (!memory)
        return 0;
    return memory.historicalOutcomeSignal * memory.recurrenceScore * 0.15;
}
function computeMultiscaleAdjustment(ms) {
    if (!ms)
        return 0;
    const coherence = ms.coherenceScore;
    const dominantDir = (ms.tick.direction + ms.local.direction + ms.regime.direction + ms.macro.direction) / 4;
    return clamp(dominantDir * coherence * 0.15, -0.15, 0.15);
}
function computeDecision(pAbove, pBelow, pNoBet, regimeInstability, causalAlignment, adversarialScore) {
    const maxDirectional = Math.max(pAbove, pBelow);
    if (regimeInstability > REGIME_INSTABILITY_HARD_STOP) {
        return { decision: 'NO BET', reason: 'regime-unstable', confidence: 1 - regimeInstability };
    }
    if (causalAlignment < CAUSAL_ALIGNMENT_MIN) {
        return { decision: 'NO BET', reason: 'causal-alignment-weak', confidence: causalAlignment };
    }
    if (adversarialScore > 0.7) {
        return { decision: 'NO BET', reason: 'adversarial-override', confidence: 1 - adversarialScore };
    }
    if (maxDirectional < CONFIDENCE_THRESHOLD) {
        return { decision: 'NO BET', reason: 'low-confidence', confidence: maxDirectional };
    }
    const decision = pAbove >= pBelow ? 'ABOVE' : 'BELOW';
    const confidence = maxDirectional - Math.min(pAbove, pBelow);
    return { decision, reason: 'field-confident', confidence: clamp(confidence, 0, 1) };
}
export class UnifiedMarketFieldService {
    constructor(bus) {
        this.bus = bus;
        this.fieldState = new Map();
        this.latestField = new Map();
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, safeHandler((e) => {
            this.getOrInit(e.contractId).micro = e;
            this.computeAndEmit(e.contractId, e.timestamp);
        }, 'UnifiedField.micro'));
        this.bus.on(EVENTS.FEATURES, safeHandler((e) => {
            this.getOrInit(e.contractId).feat = e;
            this.computeAndEmit(e.contractId, e.timestamp);
        }, 'UnifiedField.features'));
        this.bus.on(EVENTS.LIQUIDITY_GRAVITY, safeHandler((e) => {
            this.getOrInit(e.contractId).gravity = e;
        }, 'UnifiedField.gravity'));
        this.bus.on(EVENTS.FILTERED_SIGNAL, safeHandler((e) => {
            this.getOrInit(e.contractId).filtered = e;
        }, 'UnifiedField.filtered'));
        this.bus.on(EVENTS.REGIME_TRANSITION, safeHandler((e) => {
            this.getOrInit(e.contractId).regime = e;
        }, 'UnifiedField.regime'));
        this.bus.on(EVENTS.CAUSAL_WEIGHTS, safeHandler((e) => {
            this.getOrInit(e.contractId).weights = { ...e.weights };
        }, 'UnifiedField.weights'));
        this.bus.on(EVENTS.ADVERSARIAL_AUDIT, safeHandler((e) => {
            this.getOrInit(e.contractId).adversarial = e;
        }, 'UnifiedField.adversarial'));
        this.bus.on(EVENTS.MARKET_MEMORY, safeHandler((e) => {
            this.getOrInit(e.contractId).memory = e;
        }, 'UnifiedField.memory'));
        this.bus.on(EVENTS.MULTI_TIMESCALE_VIEW, safeHandler((e) => {
            this.getOrInit(e.contractId).multiscale = e;
        }, 'UnifiedField.multiscale'));
    }
    computeAndEmit(contractId, timestamp) {
        const s = this.fieldState.get(contractId);
        if (!s?.micro || !s.feat)
            return;
        const micro = s.micro;
        const feat = s.feat;
        const weights = s.weights;
        // ── Causal Forces ─────────────────────────────────────────────────────────
        // Force 1: Liquidity gravity (where is price being pulled by resting liquidity?)
        const liquidityForce = s.gravity
            ? clamp(s.gravity.gravitationalBias * (1 - s.gravity.absorptionStrength * 0.3), -1, 1)
            : clamp(micro.obi * 0.3, -1, 1); // fallback
        // Force 2: Net execution flow (aggressive buying vs selling)
        const flowForce = computeFlowForce(micro);
        // Force 3: Volatility energy direction
        const volatilityForce = computeVolatilityForce(feat);
        // Force 4: Entropy penalty (high disorder → reduce conviction)
        const entropyPenalty = computeEntropyPenalty(micro, feat, s.regime);
        // ── Field Synthesis ───────────────────────────────────────────────────────
        // Weighted combination of directional forces
        const rawFieldBias = weights.liquidity * liquidityForce +
            weights.flow * flowForce +
            weights.volatility * volatilityForce;
        // Entropy reduces the weight-effective signal (not the direction)
        const fieldStrengthFactor = clamp(1 - entropyPenalty * weights.entropy * 2, 0.1, 1);
        // Apply noise filter: attenuate field by structural fraction
        const structuralFraction = s.filtered?.structuralFraction ?? 0.7;
        const manipulationDetected = s.filtered?.manipulationFlag ?? false;
        const manipulationMultiplier = manipulationDetected ? 0.5 : 1;
        // Memory and multiscale micro-adjustments
        const memoryAdj = computeMemoryAdjustment(s.memory);
        const multiscaleAdj = computeMultiscaleAdjustment(s.multiscale);
        const fieldBias = clamp((rawFieldBias * fieldStrengthFactor * structuralFraction * manipulationMultiplier)
            + memoryAdj + multiscaleAdj, -1, 1);
        const fieldStrength = clamp(fieldStrengthFactor * structuralFraction, 0, 1);
        // ── Regime Property (emergent from field entropy) ────────────────────────
        const regimeInstability = s.regime?.regimeInstability ?? entropyPenalty * 0.8;
        const regimeProperty = s.regime?.currentRegime ?? (Math.abs(fieldBias) > 0.3 ? 'trending' :
            entropyPenalty > 0.6 ? 'choppy' : 'compression');
        // ── Probability Distribution ──────────────────────────────────────────────
        // pRaw: convert field bias to probability [0,1], centered at 0.5
        const pRaw = clamp(0.5 + fieldBias * 0.45, 0.05, 0.95);
        // Adversarial penalty: reduces directional confidence
        const adversarialScore = s.adversarial?.adversarialScore ?? 0;
        const adversarialPenalty = adversarialScore * 0.25;
        // P(NO BET) from: regime instability + low field strength + adversarial doubt
        const uncertaintyScore = regimeInstability * 0.4 + (1 - fieldStrength) * 0.4 + adversarialPenalty * 0.2;
        const pNoBet = clamp(uncertaintyScore * 1.5 - 0.3, 0, 0.6);
        // Distribute remaining probability mass
        const pAbove = pRaw * (1 - pNoBet);
        const pBelow = (1 - pRaw) * (1 - pNoBet);
        // ── Causal Attribution ────────────────────────────────────────────────────
        const totalForce = Math.abs(liquidityForce * weights.liquidity)
            + Math.abs(flowForce * weights.flow)
            + Math.abs(volatilityForce * weights.volatility)
            + 0.001;
        const causalAttribution = {
            liquidityContribution: Math.abs(liquidityForce * weights.liquidity) / totalForce,
            flowContribution: Math.abs(flowForce * weights.flow) / totalForce,
            volatilityContribution: Math.abs(volatilityForce * weights.volatility) / totalForce,
            entropyContribution: entropyPenalty * weights.entropy,
        };
        // ── Decision ─────────────────────────────────────────────────────────────
        const { decision, reason, confidence: decisionConfidence } = computeDecision(pAbove, pBelow, pNoBet, regimeInstability, fieldStrength, adversarialScore);
        const event = {
            contractId,
            liquidityForce,
            flowForce,
            volatilityForce,
            entropyPenalty,
            weights,
            fieldBias,
            fieldStrength,
            regimeProperty,
            regimeInstability,
            structuralFraction,
            manipulationDetected,
            pAbove,
            pBelow,
            pNoBet,
            decision,
            decisionConfidence,
            decisionReason: reason,
            causalAttribution,
            adversarialPenalty,
            timestamp,
        };
        this.latestField.set(contractId, event);
        this.bus.emit(EVENTS.UNIFIED_FIELD, event);
    }
    getLatestField(contractId) {
        return this.latestField.get(contractId);
    }
    getOrInit(contractId) {
        let s = this.fieldState.get(contractId);
        if (!s) {
            s = emptyState();
            this.fieldState.set(contractId, s);
        }
        return s;
    }
}
