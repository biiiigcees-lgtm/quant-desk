import { PortfolioState } from '../../core/index.js';

export function createInitialPortfolioState(initialBank: number): PortfolioState {
  return {
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

export function normalizePortfolioState(
  state: PortfolioState | null | undefined,
  initialBank: number,
): PortfolioState {
  return state ?? createInitialPortfolioState(initialBank);
}
