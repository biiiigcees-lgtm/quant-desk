import { DbAdapter } from './db.interface.js';
import { Order, PortfolioState, Position } from '../core/index.js';

export class InMemoryAdapter implements DbAdapter {
  private readonly orders: Order[] = [];
  private readonly positions: Position[] = [];
  private latestPortfolio: PortfolioState | null = null;

  async saveOrder(order: Order): Promise<void> {
    this.orders.push(order);
  }

  async savePosition(position: Position): Promise<void> {
    this.positions.push(position);
  }

  async savePortfolio(state: PortfolioState): Promise<void> {
    this.latestPortfolio = state;
  }

  async getOrders(): Promise<Order[]> {
    return [...this.orders];
  }

  async getPositions(): Promise<Position[]> {
    return [...this.positions];
  }

  async getLatestPortfolio(): Promise<PortfolioState | null> {
    return this.latestPortfolio ? { ...this.latestPortfolio } : null;
  }
}
