import { MarketContext } from '../types/market';

export function detectRegime(ctx: MarketContext): string {
  if (ctx.volatility > 0.85 && ctx.openInterest > 1_000_000) {
    return 'LIQUIDATION_EVENT';
  }
  if (ctx.volatility > 0.7) {
    return 'HIGH_VOLATILITY';
  }
  if (ctx.volatility < 0.25) {
    return 'MEAN_REVERSION';
  }
  return 'TRENDING';
}
