import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const WINDOW = 20;
const EMA_α = 0.2;
const MANIPULATION_SCORE_THRESHOLD = 0.65;
const STRUCTURAL_Z_THRESHOLD = 1.2;
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function mean(arr) {
    if (arr.length === 0)
        return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function stdDev(arr) {
    if (arr.length < 2)
        return 0.01;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
export class NoiseFilterService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, safeHandler((e) => {
            const s = this.getOrInit(e.contractId);
            s.microCache = e;
            this.maybeEmit(e.contractId, e.timestamp);
        }, 'NoiseFilter.micro'));
        this.bus.on(EVENTS.FEATURES, safeHandler((e) => {
            const s = this.getOrInit(e.contractId);
            s.featCache = e;
            this.maybeEmit(e.contractId, e.timestamp);
        }, 'NoiseFilter.features'));
    }
    maybeEmit(contractId, timestamp) {
        const s = this.state.get(contractId);
        if (!s?.microCache || !s.featCache)
            return;
        const micro = s.microCache;
        const feat = s.featCache;
        // Raw signal bias: composite of OBI + probability velocity direction
        const rawBias = clamp(micro.obi * 0.6 + feat.probabilityVelocity * 10 * 0.4, -1, 1);
        // Update EMAs for smoothing
        s.emaObi = EMA_α * micro.obi + (1 - EMA_α) * s.emaObi;
        s.emaVelocity = EMA_α * feat.probabilityVelocity + (1 - EMA_α) * s.emaVelocity;
        s.emaVol = EMA_α * feat.volatility + (1 - EMA_α) * s.emaVol;
        // Structural bias is the EMA-smoothed version
        const structuralBias = clamp(s.emaObi * 0.6 + s.emaVelocity * 10 * 0.4, -1, 1);
        // Track history for z-score based noise detection
        s.rawHistory.push(rawBias);
        s.smoothHistory.push(structuralBias);
        if (s.rawHistory.length > WINDOW)
            s.rawHistory.shift();
        if (s.smoothHistory.length > WINDOW)
            s.smoothHistory.shift();
        const rawMean = mean(s.rawHistory);
        const rawStd = stdDev(s.rawHistory);
        const rawZ = rawStd < 0.001 ? 0 : Math.abs(rawBias - rawMean) / rawStd;
        const noiseComponent = clamp(1 - rawZ / STRUCTURAL_Z_THRESHOLD, 0, 1);
        // Manipulation detection:
        // 1. Large OBI that immediately reverses (compared to EMA)
        // 2. Spoof signature: high sweep probability but low structural conviction
        const obiDeviation = Math.abs(micro.obi - s.emaObi);
        const velocityConflict = Math.sign(micro.obiVelocity) !== Math.sign(s.emaVelocity) && Math.abs(micro.obiVelocity) > 0.3;
        const spoofSignal = micro.sweepProbability > 0.6 && Math.abs(s.emaObi) < 0.15;
        const manipulationScore = clamp(obiDeviation * 0.4 + (velocityConflict ? 0.3 : 0) + (spoofSignal ? 0.3 : 0), 0, 1);
        const manipulationFlag = manipulationScore > MANIPULATION_SCORE_THRESHOLD;
        // Signal strength: how much the structural signal exceeds noise floor
        const signalStrength = clamp(Math.abs(structuralBias) * (1 - noiseComponent), 0, 1);
        // Structural fraction: how much of the raw signal is structural vs noise
        const structuralFraction = clamp(1 - noiseComponent - manipulationScore * 0.5, 0, 1);
        const event = {
            contractId,
            rawBias,
            structuralBias,
            noiseComponent,
            manipulationFlag,
            manipulationScore,
            signalStrength,
            structuralFraction,
            timestamp,
        };
        this.bus.emit(EVENTS.FILTERED_SIGNAL, event);
    }
    getOrInit(contractId) {
        let s = this.state.get(contractId);
        if (!s) {
            s = {
                emaObi: 0,
                emaVelocity: 0,
                emaVol: 0,
                rawHistory: [],
                smoothHistory: [],
                microCache: null,
                featCache: null,
            };
            this.state.set(contractId, s);
        }
        return s;
    }
}
