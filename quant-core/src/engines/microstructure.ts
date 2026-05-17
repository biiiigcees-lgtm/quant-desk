import { OrderBook, Trade, Microstructure } from '../types/market';

export function reconstructMicrostructure(
  orderBook: OrderBook,
  trades: Trade[]
): Microstructure {
  const buyAgg = trades
    .filter((t) => t.side === 'buy')
    .reduce((sum, t) => sum + t.volume, 0);
  const sellAgg = trades
    .filter((t) => t.side === 'sell')
    .reduce((sum, t) => sum + t.volume, 0);
  const imbalance = (buyAgg - sellAgg) / Math.max(buyAgg + sellAgg, 1);
  const absorptionPressure = orderBook.bidDepth / Math.max(orderBook.askDepth, 1);

  return {
    aggressionImbalance: imbalance,
    absorptionPressure,
    dominantSide: imbalance > 0 ? 'BUYERS' : 'SELLERS',
  };
}
