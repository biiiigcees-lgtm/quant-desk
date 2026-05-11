export class PostgresAdapter {
    async saveOrder(_order) {
        throw new Error('PostgresAdapter not implemented in zero-dependency mode');
    }
    async savePosition(_position) {
        throw new Error('PostgresAdapter not implemented in zero-dependency mode');
    }
    async savePortfolio(_state) {
        throw new Error('PostgresAdapter not implemented in zero-dependency mode');
    }
    async getOrders() {
        return [];
    }
    async getPositions() {
        return [];
    }
    async getLatestPortfolio() {
        return null;
    }
}
