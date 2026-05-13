import { EVENTS } from '../../core/event-bus/events.js';
export class StrategyGenomeService {
    constructor(bus, _legacyEcology) {
        this.bus = bus;
        this.genomes = new Map();
    }
    start() {
        this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
            this.applyValidation(event);
        });
        this.bus.on(EVENTS.RECONCILIATION, (event) => {
            if (!event.strategyId) {
                return;
            }
            const current = this.getOrCreateGenome(event.strategyId);
            current.trades += 1;
            const reward = clamp((event.pnl + 1) / 2, 0, 1);
            current.fitness = clamp(current.fitness * 0.85 + reward * 0.15, 0, 1);
            const volatilityPenalty = Math.min(1, Math.abs(event.pnl) / 5);
            current.stability = clamp(current.stability * 0.9 + (1 - volatilityPenalty) * 0.1, 0, 1);
            current.mutationRate = clamp(0.04 + (1 - current.stability) * 0.25 + (1 - current.fitness) * 0.2, 0.02, 0.45);
            current.lifecycle = deriveLifecycle(current);
            this.genomes.set(current.strategyId, current);
            this.publish();
        });
        this.bus.on(EVENTS.SELF_IMPROVEMENT, (event) => {
            const optimizerGenome = this.getOrCreateGenome(event.strategyId);
            optimizerGenome.validationCount += 1;
            optimizerGenome.auditScore = clamp(optimizerGenome.auditScore * 0.8 + (event.guarded ? 70 : 85) * 0.2, 0, 100);
            optimizerGenome.mutationRate = clamp(optimizerGenome.mutationRate * 0.75 + event.adaptationRate * 0.25, 0.02, event.guarded ? 0.28 : 0.45);
            if (event.guarded) {
                optimizerGenome.lifecycle = optimizerGenome.lifecycle === 'extinction' ? 'extinction' : 'decay';
            }
            else {
                optimizerGenome.lifecycle = deriveLifecycleFromValidation(optimizerGenome);
            }
            this.genomes.set(optimizerGenome.strategyId, optimizerGenome);
            this.publish();
        });
    }
    applyValidation(event) {
        if (!event.strategyId) {
            return;
        }
        const current = this.getOrCreateGenome(event.strategyId);
        if (current.lifecycle === 'extinction') {
            return;
        }
        current.validationCount += 1;
        current.auditScore = clamp(current.auditScore * 0.8 + event.score * 0.2, 0, 100);
        if (event.status === 'pass') {
            current.consecutivePasses += 1;
            current.consecutiveFails = 0;
        }
        else if (event.status === 'fail') {
            current.consecutiveFails += 1;
            current.consecutivePasses = 0;
        }
        const previous = current.lifecycle;
        const next = deriveLifecycleFromValidation(current);
        if (next !== previous) {
            current.lifecycle = next;
            this.bus.emit(EVENTS.STRATEGY_LIFECYCLE, {
                strategyId: current.strategyId,
                phase: next,
                previousPhase: previous,
                reason: `validation-score=${event.score},status=${event.status}`,
                timestamp: event.timestamp,
            });
        }
        this.genomes.set(current.strategyId, current);
        this.publish();
    }
    getOrCreateGenome(strategyId) {
        const existing = this.genomes.get(strategyId);
        if (existing) {
            return existing;
        }
        const next = {
            strategyId,
            trades: 0,
            fitness: 0,
            stability: 1,
            mutationRate: 0.08,
            lifecycle: 'birth',
            validationCount: 0,
            auditScore: 50,
            consecutivePasses: 0,
            consecutiveFails: 0,
        };
        this.genomes.set(strategyId, next);
        return next;
    }
    publish() {
        const all = [...this.genomes.values()].sort((a, b) => b.fitness - a.fitness);
        const topGenomes = all.slice(0, 8).map((item) => ({
            strategyId: item.strategyId,
            fitness: Number(item.fitness.toFixed(4)),
            stability: Number(item.stability.toFixed(4)),
            mutationRate: Number(item.mutationRate.toFixed(4)),
            lifecycle: item.lifecycle,
        }));
        const retiring = all
            .filter((item) => item.lifecycle === 'extinction')
            .map((item) => item.strategyId)
            .slice(0, 5);
        const payload = {
            timestamp: Date.now(),
            topGenomes,
            retiring,
        };
        this.bus.emit(EVENTS.STRATEGY_GENOME_UPDATE, payload);
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'organism.genome.population',
            value: all.length,
            timestamp: payload.timestamp,
        });
    }
}
function deriveLifecycle(state) {
    if (state.trades <= 3) {
        return 'birth';
    }
    if (state.fitness >= 0.72 && state.stability >= 0.65) {
        return 'maturity';
    }
    if (state.fitness >= 0.52) {
        return 'growth';
    }
    if (state.fitness < 0.25 || state.stability < 0.2) {
        return 'extinction';
    }
    return 'decay';
}
function deriveLifecycleFromValidation(state) {
    switch (state.lifecycle) {
        case 'birth':
            return deriveFromBirth(state);
        case 'growth':
            return deriveFromGrowth(state);
        case 'maturity':
            return deriveFromMaturity(state);
        case 'decay':
            return deriveFromDecay(state);
        default:
            return 'extinction';
    }
}
function deriveFromBirth(state) {
    if (state.consecutivePasses >= 5) {
        return 'growth';
    }
    return 'birth';
}
function deriveFromGrowth(state) {
    if (shouldTransitionToExtinction(state)) {
        return 'extinction';
    }
    if (shouldTransitionToDecay(state)) {
        return 'decay';
    }
    if (canTransitionToMaturity(state)) {
        return 'maturity';
    }
    return 'growth';
}
function deriveFromMaturity(state) {
    if (shouldTransitionToDecay(state)) {
        return 'decay';
    }
    return 'maturity';
}
function deriveFromDecay(state) {
    if (shouldTransitionToExtinction(state)) {
        return 'extinction';
    }
    return 'decay';
}
function shouldTransitionToExtinction(state) {
    return state.consecutiveFails >= 8 || state.auditScore < 15;
}
function shouldTransitionToDecay(state) {
    return state.consecutiveFails >= 4 || state.auditScore < 45;
}
function canTransitionToMaturity(state) {
    return state.consecutivePasses >= 8 && state.auditScore >= 75;
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
