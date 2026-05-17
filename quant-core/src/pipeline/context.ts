import { MarketContext, RegimeType, DecisionType } from '../schemas';
import { State, Action } from '../models/decision-agent';
import { LiquidityPressure } from '../models/liquidity';
import { MicrostructureFeatures } from '../models/microstructure';
import { NoiseMetrics } from '../models/noise-filter';
import { BayesianOutput } from '../models/bayesian';

/**
 * PipelineContext carries all data produced at each stage of the pipeline.
 * It provides a full audit trail from raw data → features → decisions.
 */
export interface PipelineContext {
  /** Unique ID for this pipeline cycle */
  cycleId: string;

  /** Timestamp when this cycle started (epoch ms) */
  startedAt: number;

  /** The symbol being analyzed */
  symbol: string;

  // ── Stage 1: Raw Data ──
  /** Most recent market context snapshot */
  marketContext: MarketContext | null;

  /** Recent trade data */
  recentTrades: any[];

  /** Recent order book snapshots */
  orderBookHistory: any[];

  /** Liquidation events */
  liquidations: { long: number; short: number };

  // ── Stage 2: Feature Extraction ──
  /** Kalman filter state */
  kalmanState: {
    estimate: number;
    deviation: number;
    velocity: number;
    errorCovariance: number;
  } | null;

  /** Microstructure features */
  microstructure: MicrostructureFeatures | null;

  // ── Stage 3: Regime Detection ──
  /** Detected market regime */
  regime: RegimeType | null;

  /** HMM state probabilities */
  regimeProbabilities: number[] | null;

  /** Previous regime for change detection */
  previousRegime: RegimeType | null;

  // ── Stage 4: Noise Filtering ──
  /** Noise metrics */
  noise: NoiseMetrics | null;

  /** Flag indicating if market is clean */
  isMarketClean: boolean;

  // ── Stage 5: Liquidity Analysis ──
  /** Liquidity pressure */
  liquidityPressure: LiquidityPressure | null;

  /** Liquidity stress score (0-1) */
  liquidityStress: number | null;

  /** Liquidity crisis flag */
  isLiquidityCrisis: boolean | null;

  // ── Stage 6: Bayesian Fusion ──
  /** Bayesian output */
  bayesianOutput: BayesianOutput | null;

  /** Combined signals for Bayesian fusion */
  signals: {
    momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    liquidityStress: 'SHORT_PRESSURE' | 'LONG_PRESSURE' | 'NONE';
    volatility: 'LOW' | 'MID' | 'HIGH';
    microstructure: 'STRONG_BUYING' | 'STRONG_SELLING' | 'BALANCED';
  } | null;

  // ── Stage 7: Decision ──
  /** RL agent state vector */
  agentState: State | null;

  /** RL agent decision */
  agentAction: Action | null;

  /** Final fused decision */
  finalDecision: DecisionType | null;

  /** Decision confidence (0-1) */
  finalConfidence: number | null;

  // ── Execution ──
  /** Whether to execute a trade */
  shouldTrade: boolean | null;

  /** Position size for the trade */
  positionSize: number | null;

  // ── Errors ──
  /** Any errors that occurred during processing */
  errors: PipelineError[];

  /** Warning flags */
  warnings: string[];
}

export interface PipelineError {
  stage: string;
  message: string;
  error?: Error;
  timestamp: number;
}

/**
 * Creates a new pipeline context for a symbol
 */
export function createPipelineContext(symbol: string): PipelineContext {
  return {
    cycleId: `${symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    startedAt: Date.now(),
    symbol,
    marketContext: null,
    recentTrades: [],
    orderBookHistory: [],
    liquidations: { long: 0, short: 0 },
    kalmanState: null,
    microstructure: null,
    regime: null,
    regimeProbabilities: null,
    previousRegime: null,
    noise: null,
    isMarketClean: true,
    liquidityPressure: null,
    liquidityStress: null,
    isLiquidityCrisis: null,
    bayesianOutput: null,
    signals: null,
    agentState: null,
    agentAction: null,
    finalDecision: null,
    finalConfidence: null,
    shouldTrade: null,
    positionSize: null,
    errors: [],
    warnings: [],
  };
}