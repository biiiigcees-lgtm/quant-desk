import {
  MarketContext,
  Trade,
  OrderBook,
  AIInsight,
  Microstructure,
} from '../types/market';
import { reconstructMicrostructure } from './microstructure';
import { detectRegime } from './regime';
import { generateSignals } from './signals';
import { bayesianFusion } from './bayesian';
import { liquidityField } from './liquidity';
import { detectWhales } from './whales';
import { noiseFilter, decisionEngine } from './decision';

export function buildAIInsight(
  ctx: MarketContext,
  trades: Trade[],
  orderBook: OrderBook
): AIInsight {
  const micro: Microstructure = reconstructMicrostructure(orderBook, trades);
  const regime = detectRegime(ctx);
  const signals = generateSignals({ ...ctx, ...micro });
  const bayes = bayesianFusion(signals, regime);
  const whales = detectWhales(trades);
  const noise = noiseFilter(signals, whales, regime);
  const liquidity = liquidityField(ctx);
  const decision = decisionEngine(bayes, noise);

  const narrativeParts: string[] = [];
  if (liquidity.direction !== 'SHORT_COVERING' && liquidity.direction !== 'LONG_UNWIND') {
    narrativeParts.push(`${liquidity.direction} detected`);
  }
  narrativeParts.push(
    signals.momentum === 'BULLISH' ? 'Buy pressure' : 'Sell pressure'
  );
  if (ctx.volatility > 0.7) narrativeParts.push('High volatility');
  const narrative = narrativeParts.join('. ') + '.';

  return {
    symbol: ctx.symbol,
    timestamp: ctx.timestamp,
    decision: decision.decision,
    confidence: decision.confidence,
    regime,
    probabilityLong: (bayes.probabilityLong * 100).toFixed(1),
    signals,
    whales,
    liquidity,
    narrative,
  };
}
