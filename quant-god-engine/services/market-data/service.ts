import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { Logger } from '../../core/telemetry/logger.js';
import { MarketDataEvent } from '../../core/schemas/events.js';

export class MarketDataService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly bus: EventBus, private readonly logger: Logger) {}

  start(contractId: string): void {
    let t = 0;
    this.timer = setInterval(() => {
      t += 1;
      const mid = 0.5 + Math.sin(t / 20) * 0.05;
      const spread = 0.01 + Math.abs(Math.cos(t / 13)) * 0.01;
      const event: MarketDataEvent = {
        contractId,
        yesPrice: Math.max(0.01, Math.min(0.99, mid + spread / 2)),
        noPrice: Math.max(0.01, Math.min(0.99, 1 - (mid + spread / 2))),
        spread,
        bidLevels: [
          [mid - spread / 2, 100 + (t % 20) * 10],
          [mid - spread, 70 + (t % 13) * 8],
        ],
        askLevels: [
          [mid + spread / 2, 90 + (t % 18) * 10],
          [mid + spread, 65 + (t % 9) * 8],
        ],
        volume: 1000 + (t % 25) * 30,
        timestamp: Date.now(),
      };

      this.bus.emit(EVENTS.MARKET_DATA, event);
    }, 250);

    this.logger.info('Market data service started', { contractId });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
