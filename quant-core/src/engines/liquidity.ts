import { MarketContext, LiquidityField } from '../types/market';

export function liquidityField(ctx: MarketContext): LiquidityField {
  const net = ctx.liquidationLong - ctx.liquidationShort;
  return {
    pressure: Math.tanh(net / 1_000_000),
    direction: net > 0 ? 'SHORT_COVERING' : 'LONG_UNWIND',
  };
}
