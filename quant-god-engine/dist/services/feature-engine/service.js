import { EVENTS } from '../../core/event-bus/events.js';
export class FeatureEngine {
    constructor(bus) {
        this.bus = bus;
        this.latestMarket = new Map();
        this.latestMicro = new Map();
        this.prevImplied = new Map();
    }
    start() {
        this.bus.on(EVENTS.MARKET_DATA, (event) => {
            this.latestMarket.set(event.contractId, event);
            this.tryEmit(event.contractId);
        });
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            this.latestMicro.set(event.contractId, event);
            this.tryEmit(event.contractId);
        });
    }
    tryEmit(contractId) {
        const market = this.latestMarket.get(contractId);
        const micro = this.latestMicro.get(contractId);
        if (!market || !micro) {
            return;
        }
        const impliedProbability = market.yesPrice;
        const prev = this.prevImplied.get(contractId);
        const probabilityVelocity = prev
            ? (impliedProbability - prev.p) / Math.max(0.001, (market.timestamp - prev.ts) / 1000)
            : 0;
        this.prevImplied.set(contractId, { p: impliedProbability, ts: market.timestamp });
        const volatility = Math.abs(probabilityVelocity) * 0.4 + market.spread * 0.6;
        const pressureAcceleration = micro.obiVelocity * Math.abs(probabilityVelocity);
        const feature = {
            contractId,
            impliedProbability,
            probabilityVelocity,
            volatility,
            spreadExpansionScore: micro.spreadExpansionScore,
            obi: micro.obi,
            sweepProbability: micro.sweepProbability,
            pressureAcceleration,
            timeToExpirySeconds: 15 * 60,
            timestamp: market.timestamp,
        };
        this.bus.emit(EVENTS.FEATURES, feature);
    }
}
