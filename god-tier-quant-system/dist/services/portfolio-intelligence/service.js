import { EVENTS } from '../../core/event-bus/events.js';
export class PortfolioIntelligenceService {
    constructor(bus) {
        this.bus = bus;
    }
    start() {
        this.bus.on(EVENTS.PORTFOLIO_UPDATE, (event) => {
            const concentrationRisk = Math.min(1, event.exposure / Math.max(1, event.capital));
            const crowdingRisk = Math.min(1, Math.abs(event.entropy - 0.5) * 1.5);
            const capacityUsage = Math.min(1, event.positions.length / 12);
            const payload = {
                concentrationRisk: Number(concentrationRisk.toFixed(4)),
                crowdingRisk: Number(crowdingRisk.toFixed(4)),
                capacityUsage: Number(capacityUsage.toFixed(4)),
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.PORTFOLIO_INTELLIGENCE, payload);
        });
    }
}
