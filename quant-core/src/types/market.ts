export interface MarketContext {
  symbol: string;
  timestamp: number;
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  bidDepth: number;
  askDepth: number;
  openInterest: number;
  fundingRate: number;
  liquidationLong: number;
  liquidationShort: number;
  volatility: number;
}

export interface Trade {
  volume: number;
  side: 'buy' | 'sell';
}

export interface OrderBook {
  bidDepth: number;
  askDepth: number;
}

export interface Microstructure {
  aggressionImbalance: number;
  absorptionPressure: number;
  dominantSide: 'BUYERS' | 'SELLERS';
}

export interface Signals {
  momentum: 'BULLISH' | 'BEARISH';
  liquidityBias: 'SHORT_COVERING' | 'LONG_UNWIND';
  volatilitySpike: boolean;
  strength: number;
}

export interface BayesOutput {
  probabilityLong: number;
  probabilityShort: number;
}

export interface LiquidityField {
  pressure: number;
  direction: 'SHORT_COVERING' | 'LONG_UNWIND';
}

export interface Whale {
  volume: number;
  impact: 'EXTREME' | 'LARGE';
}

export interface NoiseOutput {
  noiseLevel: number;
  cleanSignal: boolean;
}

export interface DecisionOutput {
  decision: 'LONG' | 'SHORT' | 'NO_TRADE';
  confidence: number;
}

export interface AIInsight {
  symbol: string;
  timestamp: number;
  decision: string;
  confidence: number;
  regime: string;
  probabilityLong: string;
  signals: Signals;
  whales: Whale[];
  liquidity: LiquidityField;
  narrative: string;
}
