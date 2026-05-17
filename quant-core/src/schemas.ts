import { z } from 'zod';

// MarketContext: unified data payload for analysis engines
export const MarketContextSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),               // epoch ms
  price: z.number(),
  volume: z.number(),
  buyVolume: z.number(),
  sellVolume: z.number(),
  orderBookImbalance: z.number().optional(),
  fundingRate: z.number().optional(),
  openInterest: z.number().optional(),
  liquidationLong: z.number().nonnegative(),
  liquidationShort: z.number().nonnegative(),
  volatility: z.number().min(0).max(1), // normalized 0–1
});
export type MarketContext = z.infer<typeof MarketContextSchema>;

// Trade data structure
export const TradeSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  price: z.number(),
  volume: z.number(),
  side: z.enum(['buy', 'sell']),
  tradeId: z.string().optional(),
});
export type Trade = z.infer<typeof TradeSchema>;

// OrderBook snapshot
export const OrderBookSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  bids: z.array(z.tuple([z.number(), z.number()])), // [price, size]
  asks: z.array(z.tuple([z.number(), z.number()])), // [price, size]
  bidsDepth: z.number(),
  asksDepth: z.number(),
});
export type OrderBook = z.infer<typeof OrderBookSchema>;

// Liquidation data
export const LiquidationSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  side: z.enum(['long', 'short']),
  price: z.number(),
  value: z.number(),
  exchange: z.string(),
});
export type Liquidation = z.infer<typeof LiquidationSchema>;

// Funding rate data
export const FundingRateSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  fundingRate: z.number(),
  fundingInterval: z.number(), // hours
  nextFundingTime: z.number(),
  markPrice: z.number(),
  indexPrice: z.number(),
});
export type FundingRate = z.infer<typeof FundingRateSchema>;

// Open interest data
export const OpenInterestSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  openInterest: z.number(),
  openInterestValue: z.number(),
});
export type OpenInterest = z.infer<typeof OpenInterestSchema>;

// Social sentiment data
export const SentimentSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  sentiment: z.number().min(-1).max(1), // -1 (bearish) to 1 (bullish)
  source: z.string(),
  volume: z.number(), // mention count
});
export type Sentiment = z.infer<typeof SentimentSchema>;

// Signal types
export const SignalTypeSchema = z.enum([
  'momentum',
  'liquidity_stress',
  'volatility',
  'regime',
  'liquidity_pressure',
  'noise',
]);
export type SignalType = z.infer<typeof SignalTypeSchema>;

// Signal output
export const SignalSchema = z.object({
  type: SignalTypeSchema,
  timestamp: z.number(),
  symbol: z.string(),
  value: z.number(),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

// Regime types
export const RegimeTypeSchema = z.enum([
  'CHOPPY',
  'TRENDING_UP',
  'TRENDING_DOWN',
  'LIQUIDATION_DRIVEN',
  'HIGH_VOL',
]);
export type RegimeType = z.infer<typeof RegimeTypeSchema>;

// Decision types
export const DecisionTypeSchema = z.enum(['LONG', 'SHORT', 'HOLD']);
export type DecisionType = z.infer<typeof DecisionTypeSchema>;

// Decision output
export const DecisionSchema = z.object({
  timestamp: z.number(),
  symbol: z.string(),
  action: DecisionTypeSchema,
  confidence: z.number().min(0).max(1),
  probabilityLong: z.number().min(0).max(1),
  probabilityShort: z.number().min(0).max(1),
  regime: RegimeTypeSchema,
  features: z.record(z.number()),
});
export type Decision = z.infer<typeof DecisionSchema>;

// Backtest trade
export const BacktestTradeSchema = z.object({
  timestamp: z.number(),
  symbol: z.string(),
  action: DecisionTypeSchema,
  entryPrice: z.number(),
  exitPrice: z.number().optional(),
  quantity: z.number(),
  pnl: z.number().optional(),
  fees: z.number(),
  holdingPeriod: z.number().optional(), // ms
});
export type BacktestTrade = z.infer<typeof BacktestTradeSchema>;

// Backtest results
export const BacktestResultsSchema = z.object({
  symbol: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  totalTrades: z.number(),
  totalPnL: z.number(),
  totalFees: z.number(),
  winRate: z.number(),
  maxDrawdown: z.number(),
  sharpeRatio: z.number(),
  trades: z.array(BacktestTradeSchema),
  attribution: z.record(z.number()),
});
export type BacktestResults = z.infer<typeof BacktestResultsSchema>;
