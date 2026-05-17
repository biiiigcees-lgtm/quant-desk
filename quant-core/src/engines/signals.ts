import { MarketContext, Signals, Microstructure } from '../types/market';

export function generateSignals(
  ctx: MarketContext & Microstructure
): Signals {
  const momentumScore = (ctx.buyVolume - ctx.sellVolume) / Math.max(ctx.volume, 1);
  const momentum = momentumScore > 0 ? 'BULLISH' : 'BEARISH';
  const liquidityDelta = ctx.liquidationLong - ctx.liquidationShort;
  const liquidityBias = liquidityDelta > 0 ? 'SHORT_COVERING' : 'LONG_UNWIND';
  const volatilitySpike = ctx.volatility > 0.7;

  return {
    momentum,
    liquidityBias,
    volatilitySpike,
    strength: Math.min(100, Math.abs(momentumScore) * 100),
  };
}
