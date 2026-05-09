export type Side = 'YES' | 'NO';
export type Regime =
  | 'trending'
  | 'choppy'
  | 'panic'
  | 'low-liquidity'
  | 'reversal-prone'
  | 'momentum-ignition'
  | 'compression'
  | 'expansion';

export interface MarketDataEvent {
  contractId: string;
  yesPrice: number;
  noPrice: number;
  spread: number;
  bidLevels: Array<[number, number]>;
  askLevels: Array<[number, number]>;
  volume: number;
  timestamp: number;
}

export interface MicrostructureEvent {
  contractId: string;
  obi: number;
  obiVelocity: number;
  liquidityPressureScore: number;
  spreadExpansionScore: number;
  sweepProbability: number;
  panicRepricing: boolean;
  liquidityRegime: 'normal' | 'thin' | 'vacuum';
  aggressionScore: number;
  timestamp: number;
}

export interface FeatureEvent {
  contractId: string;
  impliedProbability: number;
  probabilityVelocity: number;
  volatility: number;
  spreadExpansionScore: number;
  obi: number;
  sweepProbability: number;
  pressureAcceleration: number;
  timeToExpirySeconds: number;
  timestamp: number;
}

export interface ProbabilityEvent {
  contractId: string;
  estimatedProbability: number;
  marketImpliedProbability: number;
  edge: number;
  confidenceInterval: [number, number];
  uncertaintyScore: number;
  calibrationError: number;
  brierScore: number;
  regime: Regime;
  timestamp: number;
}

export interface StrategySignal {
  strategyId: string;
  contractId: string;
  direction: Side | 'FLAT';
  confidence: number;
  expectedValue: number;
  regime: Regime;
  rationale: string;
  timestamp: number;
}

export interface AggregatedSignal {
  contractId: string;
  direction: Side | 'FLAT';
  score: number;
  agreement: number;
  strategyWeights: Record<string, number>;
  strategySignals: StrategySignal[];
  regime: Regime;
  timestamp: number;
}

export interface RiskDecision {
  contractId: string;
  approved: boolean;
  reason: string;
  direction: Side;
  size: number;
  limitPrice: number;
  ruinProbability: number;
  timestamp: number;
}

export interface ExecutionPlan {
  contractId: string;
  direction: Side;
  orderStyle: 'market' | 'passive' | 'sliced';
  slices: number;
  expectedSlippage: number;
  fillProbability: number;
  limitPrice: number;
  size: number;
  timestamp: number;
}

export interface OrderEvent {
  orderId: string;
  contractId: string;
  direction: Side;
  size: number;
  price: number;
  status: 'pending' | 'filled' | 'partial' | 'rejected' | 'cancelled';
  timestamp: number;
}

export interface PositionState {
  positionId: string;
  contractId: string;
  direction: Side;
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  regime: Regime;
  strategyId: string;
  openedAt: number;
  expiryTs: number;
}

export interface PortfolioState {
  capital: number;
  exposure: number;
  realizedPnl: number;
  unrealizedPnl: number;
  drawdown: number;
  entropy: number;
  byRegimeExposure: Record<string, number>;
  byStrategyExposure: Record<string, number>;
  positions: PositionState[];
  timestamp: number;
}

export interface AnomalyEvent {
  contractId: string;
  type:
    | 'abnormal-liquidity'
    | 'suspicious-repricing'
    | 'volatility-spike'
    | 'execution-degradation'
    | 'strategy-instability'
    | 'calibration-drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceDegradation: number;
  details: string;
  timestamp: number;
}

export interface TelemetryEvent {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}
