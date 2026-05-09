import { EVENTS } from '../../core/event-bus/events.js';
export class ReconciliationEngine {
    constructor(bus) {
        this.bus = bus;
    }
    start() {
        this.bus.on(EVENTS.ORDER_EVENT, (order) => {
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
