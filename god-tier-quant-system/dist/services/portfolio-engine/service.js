import { EVENTS } from '../../core/event-bus/events.js';
export class PortfolioEngine {
    constructor(bus, initialCapital) {
        this.bus = bus;
        this.state = {
            capital: initialCapital,
            exposure: 0,
            realizedPnl: 0,
            unrealizedPnl: 0,
            drawdown: 0,
            entropy: 0,
            byRegimeExposure: {},
            byStrategyExposure: {},
            positions: [],
            timestamp: Date.now(),
        };
    }
    start() {
        this.bus.on(EVENTS.ORDER_EVENT, (order) => {
            const position = {
                positionId: `pos-${order.orderId}`,
                contractId: order.contractId,
                direction: order.direction,
                size: order.size,
                entryPrice: order.price,
                markPrice: order.price,
                unrealizedPnl: 0,
                regime: 'trending',
                strategyId: 'multi',
                openedAt: order.timestamp,
                expiryTs: order.timestamp + 15 * 60 * 1000,
            };
            this.state.positions.push(position);
            this.state.exposure += order.size;
            this.state.entropy = this.computeEntropy();
            this.state.timestamp = Date.now();
            this.bus.emit(EVENTS.PORTFOLIO_UPDATE, this.snapshot());
        });
    }
    snapshot() {
        return {
            ...this.state,
            positions: [...this.state.positions],
            byRegimeExposure: { ...this.state.byRegimeExposure },
            byStrategyExposure: { ...this.state.byStrategyExposure },
        };
    }
    computeEntropy() {
        if (this.state.positions.length === 0)
            return 0;
        const total = this.state.positions.reduce((sum, p) => sum + p.size, 0);
        if (total === 0)
            return 0;
        let entropy = 0;
        for (const position of this.state.positions) {
            if (position.size <= 0)
                continue;
            const prob = position.size / total;
            entropy -= prob * Math.log(prob);
        }
        return entropy;
    }
}
