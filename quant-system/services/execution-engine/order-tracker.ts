import { Order } from '../../core/index.js';

export class OrderTracker {
  private readonly ordersById: Map<string, Order> = new Map();

  add(order: Order): void {
    this.ordersById.set(order.clientOrderId, order);
  }

  update(order: Order): void {
    this.ordersById.set(order.clientOrderId, order);
  }

  get(orderId: string): Order | undefined {
    return this.ordersById.get(orderId);
  }

  list(): Order[] {
    return Array.from(this.ordersById.values());
  }
}
