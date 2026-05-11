import { DbAdapter } from './db.interface.js';
import { Order, PortfolioState, Position } from '../core/index.js';

export class PostgresAdapter implements DbAdapter {
  async saveOrder(_order: Order): Promise<void> {
    throw new Error('PostgresAdapter not implemented in zero-dependency mode');
  }

  async savePosition(_position: Position): Promise<void> {
    throw new Error('PostgresAdapter not implemented in zero-dependency mode');
  }

  async savePortfolio(_state: PortfolioState): Promise<void> {
    throw new Error('PostgresAdapter not implemented in zero-dependency mode');
  }

  async getOrders(): Promise<Order[]> {
    return [];
  }

  async getPositions(): Promise<Position[]> {
    return [];
  }

  async getLatestPortfolio(): Promise<PortfolioState | null> {
    return null;
  }
}
