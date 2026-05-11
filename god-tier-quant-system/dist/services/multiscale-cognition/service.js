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
    return val > threshold ? 1 : val < -threshold ? -1 : 0;
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
        if (!this.states.has(contractId)) {
            this.states.set(contractId, {
                tickWindow: [], localWindow: [], regimeWindow: [],
                macroWindow: [], latestContractId: contractId,
            });
        }
        return this.states.get(contractId);
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
        const first = events[0].estimatedProbability;
        const last = events[events.length - 1].estimatedProbability;
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
        const sevMap = { low: 0.2, medium: 0.6, high: 1.0 };
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
        const last = events[events.length - 1];
        const dir = last.marketRegime === 'risk-on' ? 1 :
            last.marketRegime === 'risk-off' ? -1 : 0;
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
        const temporalAlignment = coherenceScore >= 0.75 ? 'aligned' :
            coherenceScore >= 0.5 ? 'mixed' : 'divergent';
        const event = {
            contractId,
            tick,
            local,
            regime,
            macro,
            coherenceScore,
            temporalAlignment,
            timestamp: Date.now(),
        };
        this.latest.set(contractId, event);
        this.bus.emit(EVENTS.MULTI_TIMESCALE_VIEW, event);
    }
}
