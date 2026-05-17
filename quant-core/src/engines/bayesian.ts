import { Signals, BayesOutput } from '../types/market';

export function bayesianFusion(signals: Signals, regime: string): BayesOutput {
  let pLong = 0.5;
  if (signals.momentum === 'BULLISH') pLong *= 1.25;
  else pLong *= 0.75;
  if (signals.liquidityBias === 'SHORT_COVERING') pLong *= 1.2;
  if (regime === 'CHOPPY') pLong *= 0.8;
  if (regime === 'HIGH_VOLATILITY') pLong *= 1.1;
  pLong = Math.max(0.05, Math.min(0.95, pLong));
  return { probabilityLong: pLong, probabilityShort: 1 - pLong };
}
