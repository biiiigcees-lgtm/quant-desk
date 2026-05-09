import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { PortfolioIntelligenceEvent, PortfolioState } from '../../core/schemas/events.js';

export class PortfolioIntelligenceService {
  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<PortfolioState>(EVENTS.PORTFOLIO_UPDATE, (event) => {
      const concentrationRisk = Math.min(1, event.exposure / Math.max(1, event.capital));
      const crowdingRisk = Math.min(1, Math.abs(event.entropy - 0.5) * 1.5);
      const capacityUsage = Math.min(1, event.positions.length / 12);

      const payload: PortfolioIntelligenceEvent = {
        concentrationRisk: Number(concentrationRisk.toFixed(4)),
        crowdingRisk: Number(crowdingRisk.toFixed(4)),
        capacityUsage: Number(capacityUsage.toFixed(4)),
        timestamp: event.timestamp,
      };

      this.bus.emit(EVENTS.PORTFOLIO_INTELLIGENCE, payload);
    });
  }
}
