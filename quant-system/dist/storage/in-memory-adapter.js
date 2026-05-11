export class InMemoryAdapter {
    constructor() {
        this.orders = [];
        this.positions = [];
        this.latestPortfolio = null;
    }
    async saveOrder(order) {
        this.orders.push(order);
    }
    async savePosition(position) {
        this.positions.push(position);
    }
    async savePortfolio(state) {
        this.latestPortfolio = state;
    }
    async getOrders() {
        return [...this.orders];
    }
    async getPositions() {
        return [...this.positions];
    }
    async getLatestPortfolio() {
        return this.latestPortfolio ? { ...this.latestPortfolio } : null;
    }
}
