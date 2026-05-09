import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { GlobalContextEvent, MarketDataEvent } from '../../core/schemas/events.js';

export class GlobalContextService {
  private readonly stressByContract = new Map<string, number>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MarketDataEvent>(EVENTS.MARKET_DATA, (event) => {
      const stress = Math.min(1, Math.max(0, event.spread * 25 + Math.abs(event.yesPrice - 0.5)));
      this.stressByContract.set(event.contractId, stress);

      const avgStress =
        this.stressByContract.size === 0
          ? 0
          : Array.from(this.stressByContract.values()).reduce((acc, v) => acc + v, 0) /
            this.stressByContract.size;

      let marketRegime: GlobalContextEvent['marketRegime'];
      let liquidity: GlobalContextEvent['liquidity'];
      if (avgStress > 0.75) {
        marketRegime = 'risk-off';
        liquidity = 'thin';
      } else if (avgStress < 0.35) {
        marketRegime = 'risk-on';
        liquidity = 'abundant';
      } else {
        marketRegime = 'neutral';
        liquidity = 'normal';
      }

      const context: GlobalContextEvent = {
        marketRegime,
        liquidity,
        stressIndex: Number(avgStress.toFixed(4)),
        timestamp: event.timestamp,
      };

      this.bus.emit(EVENTS.GLOBAL_CONTEXT, context);
    });
  }
}
