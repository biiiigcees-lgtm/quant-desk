// Mirror of god-tier-quant-system event schemas — kept separate to avoid coupling.

export type SystemState = 'nominal' | 'cautious' | 'degraded' | 'halted';
export type ParticipantType = 'liquidity-provider' | 'momentum' | 'panic-flow' | 'arbitrage' | 'trapped-trader';
export type Regime = 'trending' | 'choppy' | 'panic' | 'low-liquidity' | 'reversal-prone' | 'momentum-ignition' | 'compression' | 'expansion';

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

export interface ParticipantFlow {
  contractId: string;
  dominant: ParticipantType;
  distribution: Record<ParticipantType, number>;
  aggressionIndex: number;
  trappedTraderSignal: boolean;
  timestamp: number;
}

export interface ProbabilityState {
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

export interface SignalState {
  contractId: string;
  direction: 'YES' | 'NO' | 'FLAT';
  score: number;
  agreement: number;
  regime: Regime;
  timestamp: number;
}

export interface CalibrationState {
  contractId: string;
  ece: number;
  brier: number;
  calibratedConfidence: number;
  timestamp: number;
}

export interface DriftState {
  contractId: string;
  psi: number;
  kl: number;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface ExecutionControlState {
  contractId?: string;
  mode: 'normal' | 'safe-mode' | 'hard-stop';
  reason: string;
  timestamp: number;
}

export interface ExecutionStateEvent {
  executionId: string;
  contractId: string;
  phase: 'created' | 'routed' | 'acknowledged' | 'partial' | 'filled' | 'rejected' | 'cancelled' | 'blocked';
  reason: string;
  safetyMode: string;
  timestamp: number;
}

export interface PortfolioState {
  capital: number;
  exposure: number;
  realizedPnl: number;
  unrealizedPnl: number;
  drawdown: number;
  positions: unknown[];
  timestamp: number;
}

export interface AnomalyState {
  contractId: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceDegradation: number;
  details: string;
  timestamp: number;
}

export interface AgentIntelligence {
  market_state?: { regime: string; narrative: string; confidence: number };
  probability_adjustment?: { recommendedAdjustment: number; calibrationScore: number };
  risk_level?: { score: number; recommendation: string; confidence: number };
  execution_recommendation?: { orderStyle: string; slices: number; expectedSlippage: number; fillProbability: number; confidence: number };
  anomaly_flags?: Array<{ type: string; severity: string; score: number }>;
  strategy_weights?: Record<string, number>;
  timestamp: number;
}

export interface SimulationUniverseState {
  scenarioCount: number;
  worstCasePnl: number;
  tailProbability: number;
  executionPathDivergence: number;
  candidateDivergences: Record<string, number>;
  bestCandidatePlan: string;
  mirrorConfidence: number;
  timestamp: number;
}

export interface SystemStateSnapshot {
  probability?: ProbabilityState;
  signal?: SignalState;
  calibration?: CalibrationState;
  drift?: DriftState;
  executionControl?: ExecutionControlState;
  executionState?: ExecutionStateEvent;
  portfolio?: PortfolioState;
  anomaly?: AnomalyState;
  aiAggregatedIntelligence?: AgentIntelligence;
  simulationUniverse?: SimulationUniverseState;
  realitySnapshot?: RealitySnapshot;
  causalInsights?: CausalInsight[];
  participantFlow?: ParticipantFlow;
}
