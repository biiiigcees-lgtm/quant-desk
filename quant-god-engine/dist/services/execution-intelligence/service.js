import { EVENTS } from '../../core/event-bus/events.js';
export class ExecutionIntelligenceEngine {
    constructor(bus) {
        this.bus = bus;
        this.idempotency = new Set();
    }
    start() {
        this.bus.on(EVENTS.RISK_DECISION, (decision) => {
            if (!decision.approved || decision.size <= 0)
                return;
            const dedupeKey = `${decision.contractId}:${decision.direction}:${Math.floor(decision.timestamp / 1000)}`;
            if (this.idempotency.has(dedupeKey))
                return;
            this.idempotency.add(dedupeKey);
            let orderStyle = 'market';
            if (decision.ruinProbability > 0.15) {
                orderStyle = 'passive';
            }
            else if (decision.size > 500) {
                orderStyle = 'sliced';
            }
            const slices = orderStyle === 'sliced' ? 4 : 1;
            let expectedSlippage = 0.004;
            if (orderStyle === 'market') {
                expectedSlippage = 0.015;
            }
            else if (orderStyle === 'sliced') {
                expectedSlippage = 0.008;
            }
            const fillProbability = orderStyle === 'passive' ? 0.72 : 0.93;
            const plan = {
                contractId: decision.contractId,
                direction: decision.direction,
                orderStyle,
                slices,
                expectedSlippage,
                fillProbability,
                limitPrice: decision.limitPrice,
                size: decision.size,
                timestamp: Date.now(),
            };
            this.bus.emit(EVENTS.EXECUTION_PLAN, plan);
        });
    }
}
