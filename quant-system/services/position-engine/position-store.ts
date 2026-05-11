import { Order, PortfolioState, Position } from '../../core/index.js';

export class PositionStore {
  private readonly portfolio: PortfolioState;

  constructor(initialBank: number) {
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

  getPortfolio(): PortfolioState {
    return { ...this.portfolio, positions: [...this.portfolio.positions], orders: [...this.portfolio.orders] };
  }

  upsertOrder(order: Order): void {
    const idx = this.portfolio.orders.findIndex((o) => o.clientOrderId === order.clientOrderId);
    if (idx >= 0) {
      this.portfolio.orders[idx] = order;
    } else {
      this.portfolio.orders.push(order);
    }
    this.portfolio.timestamp = Date.now();
  }

  addPosition(position: Position): void {
    this.portfolio.positions.push(position);
    this.portfolio.currentExposure += position.size;
    this.portfolio.timestamp = Date.now();
  }

  updatePosition(positionId: string, patch: Partial<Position>): Position | null {
    const idx = this.portfolio.positions.findIndex((p) => p.positionId === positionId);
    if (idx < 0) {
      return null;
    }
    this.portfolio.positions[idx] = { ...this.portfolio.positions[idx], ...patch };
    this.portfolio.timestamp = Date.now();
    return this.portfolio.positions[idx];
  }

  applyRealizedPnl(pnl: number): void {
    this.portfolio.bank += pnl;
    this.portfolio.dailyPnL += pnl;
    this.portfolio.sessionPnL += pnl;
    this.portfolio.peakBank = Math.max(this.portfolio.peakBank, this.portfolio.bank);
    this.portfolio.timestamp = Date.now();
  }

  setExposure(exposure: number): void {
    this.portfolio.currentExposure = Math.max(0, exposure);
    this.portfolio.timestamp = Date.now();
  }
}
