export type Side = 'YES' | 'NO';
export type ExecutionMode = 'normal' | 'safe-mode' | 'hard-stop';
export type OrderStyle = 'market' | 'passive' | 'sliced';
export type DriftSeverity = 'low' | 'medium' | 'high';
export type DirectionScore = 1 | 0 | -1;
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
  orderStyle: OrderStyle;
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
  status: 'pending' | 'acknowledged' | 'filled' | 'partial' | 'rejected' | 'cancelled' | 'expired';
  timestamp: number;
}

export interface ExecutionStateEvent {
  executionId: string;
  contractId: string;
  phase:
    | 'created'
    | 'submitted'
    | 'acknowledged'
    | 'partially_filled'
    | 'filled'
    | 'rejected'
    | 'cancelled'
    | 'expired'
    | 'blocked';
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
  severity: DriftSeverity;
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

export interface ExecutionPathMirrorEvent {
  contractId: string;
  actualStyle: OrderStyle;
  candidateDivergences: Record<string, number>;
  bestCandidatePlan: string;
  klDivergence: number;
  timestamp: number;
}

export type StrategyLifecyclePhase = 'birth' | 'growth' | 'maturity' | 'decay' | 'extinction';

export interface StrategyLifecycleEvent {
  strategyId: string;
  phase: StrategyLifecyclePhase;
  previousPhase: StrategyLifecyclePhase;
  reason?: string;
  timestamp: number;
}

export interface AdversarialAuditEvent {
  contractId: string;
  targetExecutionId?: string;
  weakAssumptions: string[];
  contradictingEvidence: string[];
  overconfidenceFlags: string[];
  hiddenRegimeRisk: boolean;
  adversarialScore: number;
  counterNarrative: string;
  timestamp: number;
}

export type SystemState = 'nominal' | 'cautious' | 'degraded' | 'halted';

export interface RealitySnapshot {
  contractId: string;
  systemState: SystemState;
  actionableState: boolean;
  uncertaintyState: 'low' | 'medium' | 'high' | 'extreme';
  executionPermission: boolean;
  canonicalSnapshotId: string;
  truthScore: number;
  calibrationFactor: number;
  driftFactor: number;
  anomalyFactor: number;
  beliefFactor: number;
  timestamp: number;
}

export interface CausalInsight {
  contractId: string;
  cause: string;
  effect: string;
  causalStrength: number;
  reverseStrength: number;
  confidence: number;
  spurious: boolean;
  timestamp: number;
}

export type ParticipantType =
  | 'liquidity-provider'
  | 'momentum'
  | 'panic-flow'
  | 'arbitrage'
  | 'trapped-trader';

export interface ParticipantFlowEvent {
  contractId: string;
  dominant: ParticipantType;
  distribution: Record<ParticipantType, number>;
  aggressionIndex: number;
  trappedTraderSignal: boolean;
  timestamp: number;
}

export interface MarketMemoryEvent {
  contractId: string;
  recurrenceScore: number;
  stressPatternMatch: boolean;
  historicalOutcomeSignal: number;
  regimeSignature: string;
  memoryDepth: number;
  timestamp: number;
}

export interface MultiTimescaleViewEvent {
  contractId: string;
  tick: { direction: DirectionScore; strength: number };
  local: { direction: DirectionScore; strength: number };
  regime: { direction: DirectionScore; strength: number };
  macro: { direction: DirectionScore; strength: number };
  coherenceScore: number;
  temporalAlignment: 'aligned' | 'mixed' | 'divergent';
  timestamp: number;
}

export interface BeliefGraphEvent {
  contractId: string;
  nodes: Array<{
    id: string;
    type: string;
    belief: number;
    uncertainty: number;
    rationale?: string;
  }>;
  edges: Array<{ from: string; to: string; weight: number }>;
  constitutionalAdjustment: number;
  graphConfidence: number;
  timestamp: number;
}

export interface AiMemoryWriteEvent {
  key: string;
  value: string;
  confidence: number;
  timestamp: number;
}

export type SnapshotSourceKind =
  | 'market_data'
  | 'microstructure'
  | 'features'
  | 'probability'
  | 'calibration'
  | 'drift'
  | 'anomaly'
  | 'execution_plan';

export interface SnapshotSourceMeta {
  source: SnapshotSourceKind;
  eventTimestamp: number;
  ageMs: number;
  version: number;
  required: boolean;
}

export type MarketState = MarketDataEvent;

export interface OrderbookState {
  yesPrice: number;
  noPrice: number;
  spread: number;
  bidLevels: Array<[number, number]>;
  askLevels: Array<[number, number]>;
  volume: number;
}

export type IndicatorState = FeatureEvent;

export interface AIState {
  probability: ProbabilityEvent;
  calibration: CalibrationEvent;
  drift: DriftEvent;
  anomaly: AnomalyEvent | null;
}

export interface RiskState {
  executionPermission: boolean;
  safetyMode: ExecutionMode;
  reason: string;
  riskLevel: number;
}

export type ExecutionState = ExecutionPlan | null;

export interface EpistemicState {
  uncertaintyScore: number;
  calibrationError: number;
  driftSeverity: DriftSeverity;
  anomalySeverity: AnomalyEvent['severity'] | 'none';
  truthScore: number;
}

export interface Snapshot {
  snapshotId: string;
  timestamp: number;
  market: MarketState;
  orderbook: OrderbookState;
  indicators: IndicatorState;
  ai: AIState;
  risk: RiskState;
  execution: ExecutionState;
  epistemic: EpistemicState;
}

export interface CanonicalDecisionSnapshot extends Snapshot {
  contractId: string;
  sequence: number;
  hash: string;
  sourceMeta: SnapshotSourceMeta[];
  microstructure: MicrostructureEvent;
  // Compatibility aliases retained while services migrate to Snapshot fields.
  aiContext: AIState;
  executionState: ExecutionState;
  riskState: RiskState;
}

export interface DecisionSnapshotEvent {
  snapshot_id: string;
  contractId: string;
  triggerEvent: string;
  timestamp: number;
  market_state_hash: string;
  eventSequence: number;
  sourceMeta: SnapshotSourceMeta[];
  state: {
    marketData: MarketDataEvent;
    microstructure: MicrostructureEvent;
    features: FeatureEvent;
    probability: ProbabilityEvent;
    calibration: CalibrationEvent;
    drift: DriftEvent;
    anomaly: AnomalyEvent | null;
    executionPlan: ExecutionPlan | null;
  };
  canonical: CanonicalDecisionSnapshot;
}

export interface DecisionSnapshotInvalidEvent {
  contractId: string;
  triggerEvent: string;
  reason: 'missing-source' | 'stale-source' | 'clock-drift' | 'stale-event';
  missingSources?: SnapshotSourceKind[];
  staleSources?: Array<{ source: SnapshotSourceKind; ageMs: number }>;
  driftMs?: number;
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
  snapshot_id: string;
  market_state_hash: string;
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
  snapshot_id: string;
  market_state_hash: string;
  output: unknown;
  metrics: AgentRunMetrics;
  timestamp: number;
}

export interface AgentFailureEvent {
  requestId: string;
  agent: AgentKind;
  contractId: string;
  triggerEvent: string;
  snapshot_id: string;
  market_state_hash: string;
  error: string;
  timestamp: number;
}

export interface AgentRoutingDecisionEvent {
  triggerEvent: string;
  contractId: string;
  snapshot_id: string;
  market_state_hash: string;
  agents: AgentKind[];
  dedupeKey: string;
  timestamp: number;
}

export interface AiOrchestrationMetricsEvent extends AgentRunMetrics {
  agent: AgentKind;
  contractId: string;
  triggerEvent: string;
  snapshot_id: string;
  market_state_hash: string;
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

export interface CanonicalAIOutput {
  bias: 'LONG' | 'SHORT' | 'WAIT';
  confidence: number;
  uncertainty: number;
  riskLevel: number;
  reasoning: string[];
  invalidation: string[];
  executionRecommendation: 'EXECUTE' | 'WAIT' | 'BLOCK';
}

export interface AnomalyFlagIntelligence {
  type: string;
  severity: string;
  score: number;
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

export interface GovernanceRuleTrace {
  rule: string;
  outcome: 'pass' | 'block' | 'adjust';
  detail: string;
  timestamp: number;
}

export interface AgentConflict {
  category: 'risk-vs-execution' | 'risk-vs-direction' | 'liquidity-vs-execution' | 'anomaly-vs-trade';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

export interface SimulationResult {
  passed: boolean;
  divergenceScore: number;
  scenarioCount: number;
  tailProbability: number;
  worstCasePnl: number;
  reason: string;
}

export interface ConstitutionalDecisionEvent {
  cycle_id: string;
  snapshot_id: string;
  market_state_hash: string;
  contractId: string;
  trade_allowed: boolean;
  final_probability: number;
  edge_score: number;
  risk_level: number;
  execution_mode: 'market' | 'passive' | 'blocked';
  regime_state: string;
  confidence_score: number;
  simulation_result: SimulationResult;
  governance_log: GovernanceRuleTrace[];
  agent_conflicts: AgentConflict[];
  agent_consensus: {
    market_confidence: number;
    risk_confidence: number;
    execution_confidence: number;
    calibration_score: number;
  };
  timestamp: number;
}

export interface SystemConsciousnessEvent {
  contractId: string;
  cycleId: string;
  snapshotId: string;
  beliefTopology: {
    topHypotheses: Array<{ nodeId: string; evidence: number; uncertainty: number }>;
    contradictionCount: number;
    contradictionDensity: number;
    uncertaintyTopology: number;
  };
  epistemicStress: {
    driftStress: number;
    calibrationStress: number;
    contradictionStress: number;
    aggregate: number;
  };
  executionConfidence: number;
  contradictions: Array<{
    source: string;
    target: string;
    severity: 'low' | 'medium' | 'high';
    detail: string;
  }>;
  contradictionDensity: number;
  cognitiveStressState: 'stable' | 'elevated' | 'critical';
  invalidationPath: string;
  timestamp: number;
}

export interface EpistemicHealthEvent {
  contractId: string;
  score: number;
  status: 'stable' | 'degraded' | 'critical';
  components: {
    contradiction: number;
    calibration: number;
    drift: number;
    anomaly: number;
  };
  // Detailed decomposition fields used by dedicated epistemic health service.
  epistemicHealthScore: number;
  calibrationHealth: number;
  driftHealth: number;
  anomalyHealth: number;
  stabilityHealth: number;
  healthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  timestamp: number;
}

export interface DigitalImmuneAlertEvent {
  contractId: string;
  threatLevel: 'elevated' | 'critical';
  reason: string;
  recommendedMode: ExecutionMode;
  cooldownUntil: number;
  timestamp: number;
}

export interface StrategyGenomeUpdateEvent {
  timestamp: number;
  topGenomes: Array<{
    strategyId: string;
    fitness: number;
    stability: number;
    mutationRate: number;
    lifecycle: 'birth' | 'growth' | 'maturity' | 'decay' | 'extinction';
  }>;
  retiring: string[];
}

export interface ReplayIntegrityEvent {
  timestamp: number;
  deterministic: boolean;
  sourceChecksum: string;
  replayChecksum: string;
  sampleSize: number;
}

// Belief-Graph Engine Event Schemas (Phase B)

export interface BeliefGraphNode {
  nodeId: string;
  hypothesis: string; // e.g. "momentum-bullish", "volatility-spike-imminent", "liquidity-concentration-yes"
  nodeType: 'market' | 'calibration' | 'drift' | 'anomaly' | 'execution' | 'regime-transition';
  evidence: number; // 0-1, how supported by current events
  uncertainty: number; // 0-1, epistemic uncertainty (wider interval = higher)
  lastUpdatedMs: number;
  decayFactor: number; // regime/time decay multiplier, 0-1
  regime: Regime; // context under which this node was strong
}

export interface BeliefGraphEdge {
  source: string; // nodeId
  target: string; // nodeId
  causalStrength: number; // 0-1, confidence in causal link
  direction: 'positive' | 'negative'; // source increases/decreases target
  description: string;
  lastUpdatedMs: number;
}

export interface BeliefGraphUpdate {
  source: SnapshotSourceKind; // which event stream triggered update
  nodesToUpdate: Array<{ nodeId: string; newEvidence: number; additionContext?: string }>;
  edgesToUpdate: Array<{ source: string; target: string; newCausalStrength: number }>;
  timestamp: number;
}

export interface ContradictionDiagnostic {
  hypothesis1: string; // nodeId
  hypothesis2: string; // nodeId
  conflictStrength: number; // 0-1, how mutually exclusive
  conflictReason: string;
  suggestedResolution?: string;
  timestamp: number;
}

export interface BeliefGraphSummary {
  contractId: string;
  snapshot_id: string;
  market_state_hash: string;
  cycle_id: string;

  // Consensus probability from graph
  beliefAdjustedProbability: number; // weighted by nodes
  beliefUncertaintyInterval: [number, number]; // [lower, upper] confidence bands

  // Contradiction state
  contradictions: ContradictionDiagnostic[];
  contradictionCount: number;
  maxContradictionStrength: number;

  // Top hypotheses by evidence + causal influence
  topHypotheses: Array<{
    nodeId: string;
    hypothesis: string;
    evidence: number;
    uncertainty: number;
    causalInfluence: number; // sum of downstream effects
  }>;

  // Regime state machine diagnosis
  regimeTransitionHazard: number; // probability of regime switch within contract horizon
  regimeTransitionConfidence: number;
  nextPredictedRegimes: Regime[];

  // Graph health stats
  graphDensity: number; // proportion of possible edges present
  graphEntropy: number; // measure of conflicting signals
  strongestBeliefs: number; // count of nodes with evidence > 0.7
  weakestBeliefs: number; // count of nodes with evidence < 0.3 and high uncertainty

  timestamp: number;
}

export interface BeliefGraphStateEvent {
  contractId: string;
  snapshot_id: string;
  market_state_hash: string;
  cycle_id: string;
  summary: BeliefGraphSummary;
  timestamp: number;
}
