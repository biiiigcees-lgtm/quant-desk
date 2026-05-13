import { EVENTS } from '../../core/event-bus/events.js';
export class OptimizationEngine {
    constructor(bus, ecology, signal) {
        this.bus = bus;
        this.ecology = ecology;
        this.signal = signal;
        this.blockedStrategies = new Set();
        this.aiSuggestedWeights = {};
        this.lastAppliedWeights = {};
        this.adaptationLocked = false;
        this.latestContractId = 'global';
    }
    start() {
        this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
            if (event.status === 'fail') {
                this.blockedStrategies.add(event.strategyId);
            }
            else if (event.status === 'pass') {
                this.blockedStrategies.delete(event.strategyId);
            }
            this.refreshWeights();
        });
        this.bus.on(EVENTS.RECONCILIATION, () => {
            this.refreshWeights();
        });
        this.bus.on(EVENTS.EXECUTION_CONTROL, (event) => {
            this.latestContractId = event.contractId ?? this.latestContractId;
            this.adaptationLocked = event.mode === 'hard-stop';
            if (this.adaptationLocked) {
                this.publishSelfImprovement('guarded-hard-stop', true, this.lastAppliedWeights);
            }
        });
        this.bus.on(EVENTS.META_CALIBRATION, (event) => {
            this.latestContractId = event.contractId;
            if (event.authorityDecay > 0.75) {
                this.adaptationLocked = true;
                this.publishSelfImprovement('guarded-meta-calibration-decay', true, this.lastAppliedWeights);
            }
            else if (event.authorityDecay < 0.45) {
                this.adaptationLocked = false;
            }
        });
        this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
            this.aiSuggestedWeights = event.strategy_weights ?? {};
            this.refreshWeights();
        });
    }
    refreshWeights() {
        const fit = this.ecology.currentFitness();
        if (this.adaptationLocked) {
            this.signal.updateStrategyWeights(this.lastAppliedWeights);
            return;
        }
        const adjusted = {};
        for (const [strategyId, weight] of Object.entries(fit)) {
            const aiWeight = this.aiSuggestedWeights[strategyId];
            const blendedWeight = typeof aiWeight === 'number' && aiWeight >= 0
                ? weight * 0.8 + aiWeight * 0.2
                : weight;
            const previous = this.lastAppliedWeights[strategyId] ?? blendedWeight;
            const boundedDelta = clamp(blendedWeight - previous, -0.25, 0.25);
            adjusted[strategyId] = this.blockedStrategies.has(strategyId)
                ? 0
                : clamp(previous + boundedDelta, 0, 1);
        }
        const normalized = normalizeWeights(adjusted);
        this.lastAppliedWeights = normalized;
        this.publishSelfImprovement('fitness-validation-update', false, normalized);
        this.signal.updateStrategyWeights(normalized);
    }
    publishSelfImprovement(reason, guarded, updatedWeights) {
        const adaptationRate = clamp(Object.values(updatedWeights).reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, Object.keys(updatedWeights).length), 0, 1);
        const event = {
            strategyId: 'portfolio-optimizer',
            contractId: this.latestContractId,
            adaptationRate: Number(adaptationRate.toFixed(4)),
            guarded,
            reason,
            updatedWeights,
            timestamp: Date.now(),
        };
        this.bus.emit(EVENTS.SELF_IMPROVEMENT, event);
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'strategy.self-improvement.rate',
            value: event.adaptationRate,
            tags: { guarded: String(guarded), reason },
            timestamp: event.timestamp,
        });
    }
}
function normalizeWeights(weights) {
    const positive = Object.fromEntries(Object.entries(weights).filter(([, value]) => value > 0));
    const total = Object.values(positive).reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
        return {};
    }
    return Object.fromEntries(Object.entries(positive).map(([key, value]) => [key, Number((value / total).toFixed(6))]));
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
