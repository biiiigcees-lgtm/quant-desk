import { BacktestResult, BacktestTrade, MarketUpdate } from '../core/index.js';
import { analyzeTrades } from './results-analyzer.js';

export interface BacktestInput {
  contractId: string;
  data: MarketUpdate[];
  threshold?: number;
  tradeSize?: number;
}

export function runBacktest(input: BacktestInput): BacktestResult {
  const threshold = input.threshold ?? 0.015;
  const size = input.tradeSize ?? 100;

  const trades: BacktestTrade[] = [];
  for (let i = 1; i < input.data.length; i++) {
    const prev = input.data[i - 1];
    const curr = input.data[i];
    const delta = curr.yesPrice - prev.yesPrice;

    if (Math.abs(delta) < threshold) {
      continue;
    }

    const side = delta > 0 ? 'YES' : 'NO';
    const entryPrice = prev.yesPrice;
    const exitPrice = curr.yesPrice;
    const pnl = side === 'YES' ? (exitPrice - entryPrice) * size : (entryPrice - exitPrice) * size;

    trades.push({
      contractId: input.contractId,
      side,
      entryPrice,
      exitPrice,
      size,
      pnl,
      openedAt: prev.timestamp,
      closedAt: curr.timestamp,
    });
  }

  return analyzeTrades(trades);
}
