import { EVENTS } from '../../core/event-bus/events.js';
export class SimulationEngine {
    constructor(bus) {
        this.bus = bus;
        this.orderCounter = 0;
    }
    start() {
        this.bus.on(EVENTS.EXECUTION_PLAN, (plan) => {
            const slip = plan.expectedSlippage * (0.85 + Math.min(0.1, plan.slices * 0.015));
            const price = plan.direction === 'YES' ? plan.limitPrice + slip : plan.limitPrice - slip;
            const fillRatio = Math.max(0.2, Math.min(1, plan.fillProbability * (plan.safetyMode === 'hard-stop' ? 0.4 : 1)));
            let status;
            if (fillRatio > 0.85) {
                status = 'filled';
            }
            else if (fillRatio < 0.35) {
                status = 'rejected';
            }
            else {
                status = 'partial';
            }
            const order = {
                orderId: `ord-${++this.orderCounter}`,
                executionId: plan.executionId,
                contractId: plan.contractId,
                direction: plan.direction,
                size: plan.size * fillRatio,
                price: Math.max(0.01, Math.min(0.99, price)),
                status,
                timestamp: Date.now(),
            };
            this.bus.emit(EVENTS.ORDER_EVENT, order);
        });
    }
}
