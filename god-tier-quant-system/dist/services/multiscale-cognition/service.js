import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const TICK_WINDOW = 10;
const LOCAL_WINDOW = 30;
const REGIME_WINDOW = 5;
const MACRO_WINDOW = 3;
function pushWindow(arr, item, max) {
    arr.push(item);
    if (arr.length > max)
        arr.shift();
}
function sign(val, threshold = 0.005) {
    if (val > threshold) {
        return 1;
    }
    if (val < -threshold) {
        return -1;
    }
    return 0;
}
export class MultiTimescaleCognitionService {
    constructor(bus) {
        this.bus = bus;
        this.states = new Map();
        this.latest = new Map();
        // Global macro window (no contractId on GlobalContextEvent)
        this.macroWindow = [];
        this.latestContractId = 'global';
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            this.latestContractId = e.contractId;
            pushWindow(s.tickWindow, e, TICK_WINDOW);
            this.emit(e.contractId);
        }, 'MultiTimescale.micro'));
        this.bus.on(EVENTS.PROBABILITY, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            this.latestContractId = e.contractId;
            pushWindow(s.localWindow, e, LOCAL_WINDOW);
            this.emit(e.contractId);
        }, 'MultiTimescale.probability'));
        this.bus.on(EVENTS.DRIFT_EVENT, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            this.latestContractId = e.contractId;
            pushWindow(s.regimeWindow, e, REGIME_WINDOW);
            this.emit(e.contractId);
        }, 'MultiTimescale.drift'));
        this.bus.on(EVENTS.GLOBAL_CONTEXT, safeHandler((e) => {
            pushWindow(this.macroWindow, e, MACRO_WINDOW);
            this.emit(this.latestContractId);
        }, 'MultiTimescale.global'));
    }
    getLatestView(contractId) {
        return this.latest.get(contractId);
    }
    getOrCreate(contractId) {
        const existing = this.states.get(contractId);
        if (existing) {
            return existing;
        }
        const created = {
            tickWindow: [], localWindow: [], regimeWindow: [],
            macroWindow: [], latestContractId: contractId,
        };
        this.states.set(contractId, created);
        return created;
    }
    tickView(events) {
        if (events.length === 0)
            return { direction: 0, strength: 0 };
        const avgObi = events.reduce((s, e) => s + e.obi, 0) / events.length;
        const avgVel = events.reduce((s, e) => s + e.obiVelocity, 0) / events.length;
        return {
            direction: sign(avgObi, 0.1),
            strength: Number(Math.min(1, Math.abs(avgObi) + Math.abs(avgVel) * 0.5).toFixed(4)),
        };
    }
    localView(events) {
        if (events.length < 2)
            return { direction: 0, strength: 0 };
        const firstEvent = events.at(0);
        const lastEvent = events.at(-1);
        if (!firstEvent || !lastEvent) {
            return { direction: 0, strength: 0 };
        }
        const first = firstEvent.estimatedProbability;
        const last = lastEvent.estimatedProbability;
        const delta = last - first;
        const avgEdge = events.reduce((s, e) => s + Math.abs(e.edge), 0) / events.length;
        return {
            direction: sign(delta, 0.005),
            strength: Number(Math.min(1, Math.abs(delta) * 20 + avgEdge * 5).toFixed(4)),
        };
    }
    regimeView(events) {
        if (events.length === 0)
            return { direction: 0, strength: 0 };
        const sevMap = { low: 0.2, medium: 0.6, high: 1 };
        const avgSev = events.reduce((s, e) => s + (sevMap[e.severity] ?? 0.2), 0) / events.length;
        const avgKl = events.reduce((s, e) => s + e.kl, 0) / events.length;
        // High drift severity = adverse = bearish signal
        return {
            direction: sign(-(avgSev - 0.3), 0.1),
            strength: Number(Math.min(1, avgKl * 2 + avgSev * 0.3).toFixed(4)),
        };
    }
    macroView(events) {
        if (events.length === 0)
            return { direction: 0, strength: 0 };
        const last = events.at(-1);
        if (!last) {
            return { direction: 0, strength: 0 };
        }
        const dir = macroDirection(last.marketRegime);
        const avgStress = events.reduce((s, e) => s + e.stressIndex, 0) / events.length;
        return {
            direction: dir,
            strength: Number(Math.min(1, avgStress).toFixed(4)),
        };
    }
    computeCoherence(views) {
        const dirs = views.map((v) => v.direction);
        const upCount = dirs.filter((d) => d === 1).length;
        const downCount = dirs.filter((d) => d === -1).length;
        return Number((Math.max(upCount, downCount) / views.length).toFixed(4));
    }
    emit(contractId) {
        const s = this.states.get(contractId);
        if (!s)
            return;
        const tick = this.tickView(s.tickWindow);
        const local = this.localView(s.localWindow);
        const regime = this.regimeView(s.regimeWindow);
        const macro = this.macroView(this.macroWindow);
        const coherenceScore = this.computeCoherence([tick, local, regime, macro]);
        const temporalAlignment = deriveTemporalAlignment(coherenceScore);
        const macroStress = this.macroWindow.length > 0
            ? this.macroWindow.reduce((sum, item) => sum + item.stressIndex, 0) / this.macroWindow.length
            : 0.5;
        const macroToLocal = clamp(Math.abs(macro.direction - local.direction) * 0.35 + macroStress * 0.45, 0, 1);
        const liquidityToDrift = clamp((1 - liquidityScore(this.macroWindow.at(-1)?.liquidity)) * 0.5 + regime.strength * 0.5, 0, 1);
        const sentimentCoupling = clamp(coherenceScore * 0.6 + Math.abs(tick.direction - local.direction) * 0.2 + Math.abs(local.direction - regime.direction) * 0.2, 0, 1);
        const riskTransmissionScore = clamp(macroToLocal * 0.4 + liquidityToDrift * 0.35 + sentimentCoupling * 0.25, 0, 1);
        const dominantDriver = pickDominantDriver(macroToLocal, liquidityToDrift, sentimentCoupling);
        const timestamp = latestTimestamp([
            s.tickWindow.at(-1)?.timestamp,
            s.localWindow.at(-1)?.timestamp,
            s.regimeWindow.at(-1)?.timestamp,
            this.macroWindow.at(-1)?.timestamp,
        ]);
        const event = {
            contractId,
            tick,
            local,
            regime,
            macro,
            coherenceScore,
            temporalAlignment,
            timestamp,
        };
        const crossMarket = {
            contractId,
            riskTransmissionScore: Number(riskTransmissionScore.toFixed(4)),
            correlationBreakdown: {
                macroToLocal: Number(macroToLocal.toFixed(4)),
                liquidityToDrift: Number(liquidityToDrift.toFixed(4)),
                sentimentCoupling: Number(sentimentCoupling.toFixed(4)),
            },
            dominantDriver,
            timestamp,
        };
        this.latest.set(contractId, event);
        this.bus.emit(EVENTS.MULTI_TIMESCALE_VIEW, event);
        this.bus.emit(EVENTS.CROSS_MARKET_CAUSAL_STATE, crossMarket);
    }
}
function latestTimestamp(values) {
    const filtered = values.filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
    if (filtered.length === 0) {
        return 1;
    }
    return Math.max(...filtered);
}
function macroDirection(regime) {
    if (regime === 'risk-on') {
        return 1;
    }
    if (regime === 'risk-off') {
        return -1;
    }
    return 0;
}
function deriveTemporalAlignment(coherenceScore) {
    if (coherenceScore >= 0.75) {
        return 'aligned';
    }
    if (coherenceScore >= 0.5) {
        return 'mixed';
    }
    return 'divergent';
}
function liquidityScore(liquidity) {
    if (liquidity === 'abundant') {
        return 1;
    }
    if (liquidity === 'normal') {
        return 0.65;
    }
    return 0.35;
}
function pickDominantDriver(macroToLocal, liquidityToDrift, sentimentCoupling) {
    if (macroToLocal >= liquidityToDrift && macroToLocal >= sentimentCoupling) {
        return 'macro-to-local';
    }
    if (liquidityToDrift >= sentimentCoupling) {
        return 'liquidity-to-drift';
    }
    return 'sentiment-coupling';
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
