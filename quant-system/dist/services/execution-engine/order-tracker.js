export class OrderTracker {
    constructor() {
        this.ordersById = new Map();
    }
    add(order) {
        this.ordersById.set(order.clientOrderId, order);
    }
    update(order) {
        this.ordersById.set(order.clientOrderId, order);
    }
    get(orderId) {
        return this.ordersById.get(orderId);
    }
    list() {
        return Array.from(this.ordersById.values());
    }
}
