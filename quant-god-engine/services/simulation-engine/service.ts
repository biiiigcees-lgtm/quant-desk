import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { ExecutionPlan, OrderEvent } from '../../core/schemas/events.js';

export class SimulationEngine {
  private orderCounter = 0;

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<ExecutionPlan>(EVENTS.EXECUTION_PLAN, (plan) => {
      const slip = plan.expectedSlippage * (0.6 + Math.random() * 0.8);
      const price = plan.direction === 'YES' ? plan.limitPrice + slip : plan.limitPrice - slip;

      const order: OrderEvent = {
        orderId: `ord-${++this.orderCounter}`,
        contractId: plan.contractId,
        direction: plan.direction,
        size: plan.size * plan.fillProbability,
        price: Math.max(0.01, Math.min(0.99, price)),
        status: plan.fillProbability > 0.85 ? 'filled' : 'partial',
        timestamp: Date.now(),
      };

      this.bus.emit(EVENTS.ORDER_EVENT, order);
    });
  }
}
