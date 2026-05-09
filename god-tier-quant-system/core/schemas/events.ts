export type Side = 'YES' | 'NO';
export type ExecutionMode = 'normal' | 'safe-mode' | 'hard-stop';
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
  safetyMode: ExecutionMode;
  timestamp: number;
}

export interface ExecutionPlan {
  executionId: string;
  contractId: string;
  direction: Side;
  orderStyle: 'market' | 'passive' | 'sliced';
  slices: number;
  expectedSlippage: number;
  fillProbability: number;
  limitPrice: number;
  size: number;
  latencyBudgetMs: number;
  routeReason: string;
  safetyMode: ExecutionMode;
  timestamp: number;
}

export interface OrderEvent {
  orderId: string;
  executionId: string;
  contractId: string;
  direction: Side;
  size: number;
  price: number;
  status: 'pending' | 'filled' | 'partial' | 'rejected' | 'cancelled';
  timestamp: number;
}

export interface ExecutionStateEvent {
  executionId: string;
  contractId: string;
  phase: 'created' | 'routed' | 'acknowledged' | 'partial' | 'filled' | 'rejected' | 'cancelled' | 'blocked';
  reason: string;
  orderId?: string;
  safetyMode: ExecutionMode;
  timestamp: number;
}

export interface ExecutionControlEvent {
  contractId?: string;
  mode: ExecutionMode;
  reason: string;
  brier?: number;
  ece?: number;
  drift?: number;
  timestamp: number;
}

export interface ValidationResultEvent {
  contractId: string;
  strategyId: string;
  kind: 'adversarial' | 'walk-forward';
  status: 'pass' | 'fail' | 'hold';
  score: number;
  details: string;
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

export interface GlobalContextEvent {
  marketRegime: 'risk-on' | 'risk-off' | 'neutral';
  liquidity: 'thin' | 'normal' | 'abundant';
  stressIndex: number;
  timestamp: number;
}

export interface FeatureIntelligenceEvent {
  contractId: string;
  qualityScore: number;
  missingRate: number;
  driftHint: number;
  timestamp: number;
}

export interface CalibrationEvent {
  contractId: string;
  ece: number;
  brier: number;
  calibratedConfidence: number;
  timestamp: number;
}

export interface DriftEvent {
  contractId: string;
  psi: number;
  kl: number;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface ExecutionAlphaEvent {
  executionId: string;
  contractId: string;
  expectedFillQualityBps: number;
  expectedLatencyMs: number;
  latencyBudgetMs: number;
  routeReason: string;
  safetyMode: ExecutionMode;
  timestamp: number;
}

export interface PortfolioIntelligenceEvent {
  concentrationRisk: number;
  crowdingRisk: number;
  capacityUsage: number;
  timestamp: number;
}

export interface SimulationUniverseEvent {
  scenarioCount: number;
  worstCasePnl: number;
  tailProbability: number;
  executionPathDivergence: number;
  candidateDivergences: Record<string, number>;
  bestCandidatePlan: string;
  mirrorConfidence: number;
  timestamp: number;
}

export interface AiMemoryWriteEvent {
  key: string;
  value: string;
  confidence: number;
  timestamp: number;
}

export interface ResearchNoteEvent {
  title: string;
  body: string;
  tags: string[];
  timestamp: number;
}

export type AgentKind =
  | 'market-analyst'
  | 'probability-calibration'
  | 'risk-governor'
  | 'strategy-evolution'
  | 'microstructure-intelligence'
  | 'execution-intelligence'
  | 'memory-research'
  | 'anomaly-detection'
  | 'meta-orchestrator';

export interface AgentRequestEvent {
  requestId: string;
  agent: AgentKind;
  contractId: string;
  triggerEvent: string;
  timestamp: number;
}

export interface AgentRunMetrics {
  latencyMs: number;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  fallbackDepth: number;
  cacheHit: boolean;
}

export interface AgentResponseEvent {
  requestId: string;
  agent: AgentKind;
  contractId: string;
  triggerEvent: string;
  output: unknown;
  metrics: AgentRunMetrics;
  timestamp: number;
}

export interface AgentFailureEvent {
  requestId: string;
  agent: AgentKind;
  contractId: string;
  triggerEvent: string;
  error: string;
  timestamp: number;
}

export interface AgentRoutingDecisionEvent {
  triggerEvent: string;
  contractId: string;
  agents: AgentKind[];
  dedupeKey: string;
  timestamp: number;
}

export interface AiOrchestrationMetricsEvent extends AgentRunMetrics {
  agent: AgentKind;
  contractId: string;
  triggerEvent: string;
  timestamp: number;
}

export interface MarketStateIntelligence {
  regime: string;
  narrative: string;
  observations: string[];
  confidence: number;
}

export interface ProbabilityAdjustmentIntelligence {
  recommendedAdjustment: number;
  calibrationScore: number;
  overconfidenceDetected: boolean;
}

export interface RiskLevelIntelligence {
  score: number;
  recommendation: string;
  confidence: number;
}

export interface ExecutionRecommendationIntelligence {
  orderStyle: 'market' | 'passive' | 'sliced';
  slices: number;
  timingMs: number;
  expectedSlippage: number;
  fillProbability: number;
  confidence: number;
}

export interface AnomalyFlagIntelligence {
  type: string;
  severity: string;
  score: number;
}

export interface BeliefNode {
  id: string;
  type: 'microstructure' | 'calibration' | 'drift' | 'anomaly' | 'regime';
  belief: number;
  confidence: number;
  weight: number;
  updatedAt: number;
}

export interface BeliefGraphEvent {
  contractId: string;
  nodes: BeliefNode[];
  constitutionalAdjustment: number;
  graphConfidence: number;
  timestamp: number;
}

export type StrategyLifecyclePhase = 'birth' | 'growth' | 'maturity' | 'decay' | 'extinction';

export interface StrategyLifecycleEvent {
  strategyId: string;
  phase: StrategyLifecyclePhase;
  previousPhase: StrategyLifecyclePhase;
  fitness: number;
  auditScore: number;
  reason: string;
  timestamp: number;
}

export interface ExecutionPathMirrorEvent {
  contractId: string;
  actualStyle: string;
  candidateDivergences: Record<string, number>;
  bestCandidatePlan: string;
  klDivergence: number;
  timestamp: number;
}

export interface AggregatedIntelligenceEvent {
  contractId: string;
  market_state: MarketStateIntelligence;
  probability_adjustment: ProbabilityAdjustmentIntelligence;
  risk_level: RiskLevelIntelligence;
  execution_recommendation: ExecutionRecommendationIntelligence;
  anomaly_flags: AnomalyFlagIntelligence[];
  strategy_weights: Record<string, number>;
  timestamp: number;
}
