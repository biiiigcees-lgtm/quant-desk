// Market events from Kalshi
export interface MarketUpdate {
  contractId: string;
  yesPrice: number;
  noPrice: number;
  impliedProb: number;
  volume: number;
  timestamp: number;
  bids?: Array<[number, number]>; // [price, size]
  asks?: Array<[number, number]>;
}

// Feature vector computed by feature engine
export interface FeatureVector {
  contractId: string;
  impliedProb: number;
  ema3: number;
  ema9: number;
  ema21: number;
  rsi: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  probVelocity: number;
  volatilityRegime: 'low' | 'medium' | 'high';
  obImbalance: number; // positive = buy pressure
  timeDecay: number; // seconds to expiry
  timestamp: number;
}

// Individual strategy signal
export interface StrategySignal {
  strategyName: string;
  direction: 'YES' | 'NO' | 'FLAT';
  confidence: number; // 0-1
  expectedValue: number; // expected profit if taken
  regime: string;
  reasoning: string;
  timestamp: number;
}

// Aggregated signal from all strategies
export interface AggregatedSignal {
  contractId: string;
  finalSignal: 'YES' | 'NO' | 'FLAT';
  score: number; // typically -100 to +100
  regime: string;
  agreement: number; // percentage 0-100
  signals: StrategySignal[];
  timestamp: number;
}

// Risk decision output
export interface RiskDecision {
  contractId: string;
  direction: 'YES' | 'NO';
  score: number;
  requestedSize: number;
  approved: boolean;
  reason: string;
  approvedSize?: number;
  limitPrice?: number;
  timestamp: number;
}

export interface AnalystReport {
  contractId: string;
  summary: string;
  confidenceBand: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface BacktestTrade {
  contractId: string;
  side: 'YES' | 'NO';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  openedAt: number;
  closedAt: number;
}

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
}

// Order representation
export interface Order {
  clientOrderId: string;
  contractId: string;
  side: 'YES' | 'NO';
  size: number;
  price: number;
  status: 'pending' | 'filled' | 'partial' | 'rejected' | 'cancelled';
  filledSize: number;
  fills: Array<{
    size: number;
    price: number;
    timestamp: number;
  }>;
  createdAt: number;
  filledAt?: number;
}

// Position
export interface Position {
  positionId: string;
  contractId: string;
  side: 'YES' | 'NO';
  entryPrice: number;
  size: number;
  openedAt: number;
  expiresAt: number;
  currentPrice: number;
  currentPnL: number;
  status: 'open' | 'closing' | 'closed';
}

// Portfolio state
export interface PortfolioState {
  bank: number;
  currentExposure: number;
  peakBank: number;
  dailyPnL: number;
  sessionPnL: number;
  positions: Position[];
  orders: Order[];
  timestamp: number;
}

// Trade recommendation
export interface TradeRecommendation {
  contractId: string;
  direction: 'YES' | 'NO';
  confidence: number;
  suggestedSize: number;
  riskReward: number;
  timestamp: number;
}
