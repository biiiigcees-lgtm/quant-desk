import { Order, PortfolioState, Position } from '../core/index.js';

export interface DbAdapter {
  saveOrder(order: Order): Promise<void>;
  savePosition(position: Position): Promise<void>;
  savePortfolio(state: PortfolioState): Promise<void>;
  getOrders(): Promise<Order[]>;
  getPositions(): Promise<Position[]>;
  getLatestPortfolio(): Promise<PortfolioState | null>;
}
