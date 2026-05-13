import { EVENTS } from '../../core/event-bus/events.js';
export class MarketPhysicsService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
        this.latest = new Map();
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            const state = this.getState(event.contractId);
            state.micro = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.FEATURES, (event) => {
            const state = this.getState(event.contractId);
            state.feature = event;
            this.emit(event.contractId, event.timestamp);
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const state = this.getState(event.contractId);
            state.drift = event;
            this.emit(event.contractId, event.timestamp);
        });
    }
    getLatest(contractId) {
        return this.latest.get(contractId);
    }
    getState(contractId) {
        const current = this.state.get(contractId);
        if (current) {
            return current;
        }
        const next = {};
        this.state.set(contractId, next);
        return next;
    }
    emit(contractId, timestamp) {
        const state = this.state.get(contractId);
        if (!state?.micro || !state.feature) {
            return;
        }
        const driftSeverity = state.drift?.severity ?? 'low';
        const driftPenalty = driftSeverity === 'high' ? 0.35 : driftSeverity === 'medium' ? 0.2 : 0.08;
        const compression = clamp((1 - state.micro.spreadExpansionScore) * 0.55 +
            (1 - Math.min(1, Math.abs(state.micro.obiVelocity))) * 0.25 +
            (1 - state.feature.volatility) * 0.2, 0, 1);
        const expansion = clamp(state.micro.spreadExpansionScore * 0.45 +
            Math.min(1, Math.abs(state.micro.obiVelocity)) * 0.35 +
            state.feature.volatility * 0.2, 0, 1);
        const inertia = clamp(Math.min(1, Math.abs(state.feature.probabilityVelocity)) * 0.5 +
            Math.min(1, Math.abs(state.micro.obi)) * 0.35 +
            Math.min(1, Math.abs(state.feature.pressureAcceleration)) * 0.15, 0, 1);
        const exhaustion = clamp(state.feature.volatility * 0.45 +
            state.micro.sweepProbability * 0.35 +
            (1 - inertia) * 0.2, 0, 1);
        const entropyExpansion = clamp((state.drift?.kl ?? 0) * 0.55 +
            (state.drift?.psi ?? 0) * 0.35 +
            driftPenalty * 0.1, 0, 1);
        const liquidityConservation = clamp(1 - (state.micro.spreadExpansionScore * 0.55 +
            (state.micro.liquidityRegime === 'vacuum' ? 0.35 : state.micro.liquidityRegime === 'thin' ? 0.18 : 0.05) +
            state.micro.sweepProbability * 0.1), 0, 1);
        const structuralStress = clamp(expansion * 0.35 + exhaustion * 0.3 + entropyExpansion * 0.25 + (1 - liquidityConservation) * 0.1, 0, 1);
        const event = {
            contractId,
            compression: Number(compression.toFixed(4)),
            expansion: Number(expansion.toFixed(4)),
            inertia: Number(inertia.toFixed(4)),
            exhaustion: Number(exhaustion.toFixed(4)),
            entropyExpansion: Number(entropyExpansion.toFixed(4)),
            liquidityConservation: Number(liquidityConservation.toFixed(4)),
            structuralStress: Number(structuralStress.toFixed(4)),
            timestamp,
        };
        this.latest.set(contractId, event);
        this.bus.emit(EVENTS.MARKET_PHYSICS, event);
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'market.physics.structural-stress',
            value: event.structuralStress,
            tags: { contractId },
            timestamp,
        });
    }
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
