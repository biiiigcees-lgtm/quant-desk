import { EVENTS, } from '../../core/index.js';
import { IdempotencyGuard } from './idempotency.js';
import { OrderTracker } from './order-tracker.js';
export class ExecutionService {
    constructor(eventBus, logger, orderClient) {
        this.eventBus = eventBus;
        this.logger = logger;
        this.orderClient = orderClient;
        this.guard = new IdempotencyGuard();
        this.tracker = new OrderTracker();
        this.decisionListener = (decision) => {
            void this.handleRiskDecision(decision);
        };
    }
    start() {
        this.eventBus.on(EVENTS.RISK_DECISION, this.decisionListener);
        this.logger.info('Execution service started');
    }
    stop() {
        this.eventBus.off(EVENTS.RISK_DECISION, this.decisionListener);
    }
    listOrders() {
        return this.tracker.list();
    }
    async handleRiskDecision(decision) {
        if (!decision.approved || !decision.approvedSize || decision.approvedSize <= 0) {
            return;
        }
        const orderId = `${decision.contractId}-${decision.direction}-${decision.timestamp}`;
        if (!this.guard.checkAndSet(orderId)) {
            this.logger.warn('Duplicate order blocked', { orderId });
            return;
        }
        try {
            const order = await this.orderClient.placeOrder({
                contractId: decision.contractId,
                side: decision.direction,
                size: decision.approvedSize,
                price: decision.limitPrice ?? 0.5,
                clientOrderId: orderId,
            });
            this.tracker.add(order);
            this.eventBus.emit(EVENTS.ORDER_CREATED, order);
            if (order.status === 'filled' || order.status === 'partial') {
                this.eventBus.emit(EVENTS.ORDER_FILLED, order);
            }
        }
        catch (error) {
            this.logger.error('Order execution failed', { error: String(error), decision });
            this.eventBus.emit(EVENTS.EXECUTION_ERROR, {
                error: String(error),
                decision,
                timestamp: Date.now(),
            });
        }
    }
}
