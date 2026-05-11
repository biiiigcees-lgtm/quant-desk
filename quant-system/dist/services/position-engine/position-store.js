export class PositionStore {
    constructor(initialBank) {
        this.portfolio = {
            bank: initialBank,
            currentExposure: 0,
            peakBank: initialBank,
            dailyPnL: 0,
            sessionPnL: 0,
            positions: [],
            orders: [],
            timestamp: Date.now(),
        };
    }
    getPortfolio() {
        return { ...this.portfolio, positions: [...this.portfolio.positions], orders: [...this.portfolio.orders] };
    }
    upsertOrder(order) {
        const idx = this.portfolio.orders.findIndex((o) => o.clientOrderId === order.clientOrderId);
        if (idx >= 0) {
            this.portfolio.orders[idx] = order;
        }
        else {
            this.portfolio.orders.push(order);
        }
        this.portfolio.timestamp = Date.now();
    }
    addPosition(position) {
        this.portfolio.positions.push(position);
        this.portfolio.currentExposure += position.size;
        this.portfolio.timestamp = Date.now();
    }
    updatePosition(positionId, patch) {
        const idx = this.portfolio.positions.findIndex((p) => p.positionId === positionId);
        if (idx < 0) {
            return null;
        }
        this.portfolio.positions[idx] = { ...this.portfolio.positions[idx], ...patch };
        this.portfolio.timestamp = Date.now();
        return this.portfolio.positions[idx];
    }
    applyRealizedPnl(pnl) {
        this.portfolio.bank += pnl;
        this.portfolio.dailyPnL += pnl;
        this.portfolio.sessionPnL += pnl;
        this.portfolio.peakBank = Math.max(this.portfolio.peakBank, this.portfolio.bank);
        this.portfolio.timestamp = Date.now();
    }
    setExposure(exposure) {
        this.portfolio.currentExposure = Math.max(0, exposure);
        this.portfolio.timestamp = Date.now();
    }
}
