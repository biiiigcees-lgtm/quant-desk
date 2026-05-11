import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { FeatureEvent, MarketDataEvent, MicrostructureEvent } from '../../core/schemas/events.js';

export class FeatureEngine {
  private readonly latestMarket: Map<string, MarketDataEvent> = new Map();
  private readonly latestMicro: Map<string, MicrostructureEvent> = new Map();
  private readonly prevImplied: Map<string, { p: number; ts: number }> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MarketDataEvent>(EVENTS.MARKET_DATA, (event) => {
      this.latestMarket.set(event.contractId, event);
      this.tryEmit(event.contractId);
    });

    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, (event) => {
      this.latestMicro.set(event.contractId, event);
      this.tryEmit(event.contractId);
    });
  }

  private tryEmit(contractId: string): void {
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

    const feature: FeatureEvent = {
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
