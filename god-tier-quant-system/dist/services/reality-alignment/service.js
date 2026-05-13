import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const LEARNING_RATE = 0.08;
const MIN_WEIGHT = 0.05;
const INITIAL_WEIGHTS = { liquidity: 0.25, flow: 0.35, volatility: 0.25, entropy: 0.15 };
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function normalizeWeights(w) {
    const total = w.liquidity + w.flow + w.volatility + w.entropy;
    if (total < 0.001)
        return { ...INITIAL_WEIGHTS };
    return {
        liquidity: Math.max(MIN_WEIGHT, w.liquidity / total),
        flow: Math.max(MIN_WEIGHT, w.flow / total),
        volatility: Math.max(MIN_WEIGHT, w.volatility / total),
        entropy: Math.max(MIN_WEIGHT, w.entropy / total),
    };
}
export class RealityAlignmentService {
    constructor(bus) {
        this.bus = bus;
        this.contractState = new Map();
        this.cycleCounter = 0;
    }
    start() {
        this.bus.on(EVENTS.UNIFIED_FIELD, safeHandler((e) => {
            const state = this.getOrInit(e.contractId);
            const cycleId = `align-${++this.cycleCounter}-${e.contractId}`;
            state.pending.push({
                cycleId,
                pAbove: e.pAbove,
                pBelow: e.pBelow,
                liquidityForce: e.liquidityForce,
                flowForce: e.flowForce,
                volatilityForce: e.volatilityForce,
                entropyPenalty: e.entropyPenalty,
                timestamp: e.timestamp,
            });
            if (state.pending.length > 100)
                state.pending.shift();
        }, 'RealityAlignment.field'));
        this.bus.on(EVENTS.PROBABILITY, safeHandler((e) => {
            this.align(e);
        }, 'RealityAlignment.probability'));
    }
    align(e) {
        const state = this.getOrInit(e.contractId);
        // Use market-implied probability direction as outcome signal
        const currentPriceSign = Math.sign(e.marketImpliedProbability - 0.5);
        const prevSign = state.lastPriceSign;
        state.lastPriceSign = currentPriceSign;
        // Only update when we observe a direction (non-zero)
        if (currentPriceSign === 0 || state.pending.length === 0)
            return;
        // Match against most recent prediction
        const pred = state.pending[state.pending.length - 1];
        const actualOutcome = currentPriceSign > 0 ? 'ABOVE' : currentPriceSign < 0 ? 'BELOW' : 'UNKNOWN';
        // Compute prediction error (Brier-like per direction)
        const predictedDirection = pred.pAbove > pred.pBelow ? 1 : pred.pAbove < pred.pBelow ? -1 : 0;
        const correct = predictedDirection === currentPriceSign;
        const totalError = correct ? 0 : Math.abs(pred.pAbove - pred.pBelow);
        // Error decomposition: which force was most aligned / misaligned?
        const actualSign = currentPriceSign;
        // Force alignment: positive force aligned with outcome → low error contribution
        // Force misalignment: force opposed outcome → high error contribution
        const liqAlignment = Math.sign(pred.liquidityForce) === actualSign ? 0 : 1;
        const flowAlignment = Math.sign(pred.flowForce) === actualSign ? 0 : 1;
        const volAlignment = Math.sign(pred.volatilityForce) === actualSign ? 0 : 1;
        const entropyAlignment = pred.entropyPenalty > 0.5 && !correct ? 1 : 0;
        const totalAlignment = liqAlignment + flowAlignment + volAlignment + entropyAlignment + 0.001;
        const errorDecomposition = {
            liquidityError: (liqAlignment / totalAlignment) * totalError,
            flowError: (flowAlignment / totalAlignment) * totalError,
            volatilityError: (volAlignment / totalAlignment) * totalError,
            entropyError: (entropyAlignment / totalAlignment) * totalError,
        };
        // Weight update: increase weights of forces that were correctly aligned,
        // decrease weights of forces that were misaligned
        const w = state.weights;
        const newWeights = {
            liquidity: clamp(w.liquidity + LEARNING_RATE * (liqAlignment === 0 ? 1 : -1) * 0.1, 0.001, 1),
            flow: clamp(w.flow + LEARNING_RATE * (flowAlignment === 0 ? 1 : -1) * 0.1, 0.001, 1),
            volatility: clamp(w.volatility + LEARNING_RATE * (volAlignment === 0 ? 1 : -1) * 0.1, 0.001, 1),
            entropy: clamp(w.entropy - LEARNING_RATE * errorDecomposition.entropyError * 0.5, 0.001, 1),
        };
        state.weights = normalizeWeights(newWeights);
        state.sampleSize++;
        // Remove matched prediction
        const idx = state.pending.findIndex(p => p === pred);
        if (idx >= 0)
            state.pending.splice(idx, 1);
        const event = {
            contractId: e.contractId,
            cycleId: pred.cycleId,
            predictedPAbove: pred.pAbove,
            predictedPBelow: pred.pBelow,
            actualOutcome,
            totalError,
            errorDecomposition,
            updatedWeights: { ...state.weights },
            sampleSize: state.sampleSize,
            timestamp: e.timestamp,
        };
        this.bus.emit(EVENTS.REALITY_ALIGNMENT, event);
        void prevSign;
    }
    getWeights(contractId) {
        return this.contractState.get(contractId)?.weights ?? { ...INITIAL_WEIGHTS };
    }
    getOrInit(contractId) {
        let s = this.contractState.get(contractId);
        if (!s) {
            s = {
                weights: { ...INITIAL_WEIGHTS },
                pending: [],
                sampleSize: 0,
                lastPriceSign: 0,
            };
            this.contractState.set(contractId, s);
        }
        return s;
    }
}
