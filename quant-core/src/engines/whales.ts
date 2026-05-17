import { Trade, Whale } from '../types/market';

export function detectWhales(trades: Trade[]): Whale[] {
  return trades
    .filter((t) => t.volume >= 100_000)
    .map((t) => ({
      volume: t.volume,
      impact: t.volume > 500_000 ? 'EXTREME' : 'LARGE',
    }));
}
