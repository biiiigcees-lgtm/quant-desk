import { MarketContext } from '../schemas';

export interface LiquidityPressure {
  pressure: number;
  direction: 'SHORTS_COVERING' | 'LONGS_UNWINDING' | 'NEUTRAL';
  intensity: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  expectedRebound: number;
}

export function liquidityField(ctx: MarketContext): LiquidityPressure {
  const delta = ctx.liquidationLong - ctx.liquidationShort;
  
  // Normalize pressure using tanh to [-1, 1]
  const pressure = Math.tanh(delta / 1_000_000);
  
  let direction: 'SHORTS_COVERING' | 'LONGS_UNWINDING' | 'NEUTRAL';
  if (delta > 10000) {
    direction = 'SHORTS_COVERING';
  } else if (delta < -10000) {
    direction = 'LONGS_UNWINDING';
  } else {
    direction = 'NEUTRAL';
  }

  // Classify intensity
  const absPressure = Math.abs(pressure);
  let intensity: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  if (absPressure < 0.2) {
    intensity = 'LOW';
  } else if (absPressure < 0.5) {
    intensity = 'MEDIUM';
  } else if (absPressure < 0.8) {
    intensity = 'HIGH';
  } else {
    intensity = 'EXTREME';
  }

  // Expected rebound based on pressure magnitude
  const expectedRebound = absPressure * 0.02; // 2% max expected rebound

  return {
    pressure,
    direction,
    intensity,
    expectedRebound,
  };
}

export function computeLiquidityStress(
  ctx: MarketContext,
  orderBookDepth: number
): number {
  let stress = 0;

  // Low order book depth increases stress
  if (orderBookDepth < 100000) {
    stress += 0.3;
  } else if (orderBookDepth < 500000) {
    stress += 0.15;
  }

  // High volatility increases stress
  if (ctx.volatility > 0.7) {
    stress += 0.25;
  } else if (ctx.volatility > 0.5) {
    stress += 0.15;
  }

  // Large liquidations increase stress
  const totalLiquidations = ctx.liquidationLong + ctx.liquidationShort;
  if (totalLiquidations > 5000000) {
    stress += 0.3;
  } else if (totalLiquidations > 1000000) {
    stress += 0.15;
  }

  // Extreme funding rate increases stress
  if (ctx.fundingRate !== undefined) {
    if (Math.abs(ctx.fundingRate) > 0.01) {
      stress += 0.2;
    } else if (Math.abs(ctx.fundingRate) > 0.005) {
      stress += 0.1;
    }
  }

  return Math.min(1, stress);
}

export function estimateSlippage(
  orderSize: number,
  orderBookDepth: number,
  _currentPrice: number
): number {
  // Simple slippage model based on order size relative to depth
  const depthRatio = orderSize / orderBookDepth;
  
  if (depthRatio < 0.01) {
    return 0.0001; // 0.01% slippage
  } else if (depthRatio < 0.05) {
    return 0.0005; // 0.05% slippage
  } else if (depthRatio < 0.1) {
    return 0.001; // 0.1% slippage
  } else if (depthRatio < 0.2) {
    return 0.002; // 0.2% slippage
  } else {
    return 0.005; // 0.5% slippage
  }
}

export function detectLiquidityCrisis(
  ctx: MarketContext,
  orderBookDepth: number,
  recentPriceMoves: number[]
): boolean {
  // Liquidity crisis detection
  const depthCrisis = orderBookDepth < 50000;
  const volCrisis = ctx.volatility > 0.8;
  
  const avgPriceMove = recentPriceMoves.reduce((a, b) => a + b, 0) / recentPriceMoves.length;
  const priceCrisis = Math.abs(avgPriceMove) > 0.05; // 5% move

  return depthCrisis || volCrisis || priceCrisis;
}

export function computeLiquidityScore(
  depth: number,
  spread: number,
  volatility: number
): number {
  // Higher score = better liquidity
  let score = 1;

  // Depth penalty
  if (depth < 100000) {
    score *= 0.5;
  } else if (depth < 500000) {
    score *= 0.75;
  }

  // Spread penalty (spread as percentage of price)
  if (spread > 0.001) {
    score *= 0.7;
  } else if (spread > 0.0005) {
    score *= 0.85;
  }

  // Volatility penalty
  if (volatility > 0.7) {
    score *= 0.6;
  } else if (volatility > 0.5) {
    score *= 0.8;
  }

  return Math.max(0, Math.min(1, score));
}
