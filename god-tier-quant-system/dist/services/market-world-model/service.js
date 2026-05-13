import { EVENTS } from '../../core/event-bus/events.js';
export class MarketWorldModelService {
    constructor(bus) {
        this.bus = bus;
        this.byContract = new Map();
        this.latest = new Map();
    }
    start() {
        this.bus.on(EVENTS.MARKET_CAUSAL_STATE, (event) => {
            const state = this.getState(event.contractId);
            state.causal = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.PARTICIPANT_FLOW, (event) => {
            const state = this.getState(event.contractId);
            state.participant = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.SCENARIO_BRANCH_STATE, (event) => {
            const state = this.getState(event.contractId);
            state.scenario = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.CROSS_MARKET_CAUSAL_STATE, (event) => {
            const state = this.getState(event.contractId);
            state.crossMarket = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.GLOBAL_CONTEXT, (event) => {
            this.latestGlobal = event;
            for (const contractId of this.byContract.keys()) {
                const state = this.getState(contractId);
                state.global = event;
                this.emit(contractId, event.timestamp);
            }
        });
    }
    getLatest(contractId) {
        return this.latest.get(contractId);
    }
    getState(contractId) {
        const current = this.byContract.get(contractId);
        if (current) {
            return current;
        }
        const next = {
            global: this.latestGlobal,
        };
        this.byContract.set(contractId, next);
        return next;
    }
    emit(contractId, timestamp) {
        const state = this.byContract.get(contractId);
        if (!state?.causal || !state.participant || !state.scenario) {
            return;
        }
        const participantIntent = mapIntent(state.participant);
        const globalLiquidityScore = state.global?.liquidity === 'abundant' ? 0.82 : state.global?.liquidity === 'normal' ? 0.6 : 0.35;
        const syntheticLiquidityProbability = clamp(state.participant.distribution['liquidity-provider'] * 0.5 +
            globalLiquidityScore * 0.25 +
            (1 - state.causal.instabilityRisk) * 0.25, 0, 1);
        const forcedPositioningPressure = clamp(state.participant.aggressionIndex * 0.45 +
            state.scenario.volatilityWeight * 0.3 +
            state.causal.instabilityRisk * 0.25, 0, 1);
        const reflexivityAcceleration = clamp((state.causal.topDriver?.strength ?? 0) * 0.4 +
            (state.crossMarket?.riskTransmissionScore ?? 0.45) * 0.35 +
            Math.abs(state.participant.distribution.momentum - state.participant.distribution['liquidity-provider']) * 0.25, 0, 1);
        const worldConfidence = clamp(state.causal.confidence * 0.4 +
            (1 - state.scenario.volatilityWeight) * 0.25 +
            syntheticLiquidityProbability * 0.2 +
            (1 - (state.crossMarket?.riskTransmissionScore ?? 0.5)) * 0.15, 0, 1);
        const event = {
            contractId,
            participantIntent,
            syntheticLiquidityProbability: Number(syntheticLiquidityProbability.toFixed(4)),
            forcedPositioningPressure: Number(forcedPositioningPressure.toFixed(4)),
            reflexivityAcceleration: Number(reflexivityAcceleration.toFixed(4)),
            worldConfidence: Number(worldConfidence.toFixed(4)),
            scenarioDominantBranch: state.scenario.dominantBranch,
            hiddenState: state.causal.hiddenState,
            timestamp,
        };
        this.latest.set(contractId, event);
        this.bus.emit(EVENTS.MARKET_WORLD_STATE, event);
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'market.world.confidence',
            value: event.worldConfidence,
            tags: { contractId, intent: event.participantIntent },
            timestamp,
        });
    }
}
function mapIntent(flow) {
    if (flow.dominant === 'panic-flow') {
        return 'liquidation';
    }
    if (flow.dominant === 'trapped-trader') {
        return 'hedging';
    }
    if (flow.dominant === 'liquidity-provider') {
        return flow.aggressionIndex < 0.4 ? 'accumulation' : 'distribution';
    }
    if (flow.dominant === 'momentum') {
        return flow.aggressionIndex > 0.62 ? 'distribution' : 'accumulation';
    }
    return 'neutral';
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
