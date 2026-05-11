import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { OrderEvent } from '../../core/schemas/events.js';

export class ReconciliationEngine {
  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<OrderEvent>(EVENTS.ORDER_EVENT, (order) => {
      const pnlProxy = (order.direction === 'YES' ? 1 : -1) * (0.5 - order.price) * order.size;
      this.bus.emit(EVENTS.RECONCILIATION, {
        strategyId: 'momentum',
        pnl: pnlProxy,
        orderId: order.orderId,
        timestamp: Date.now(),
      });
    });
  }
}
