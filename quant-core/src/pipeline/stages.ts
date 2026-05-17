import { MarketContext } from '../schemas';
import { PipelineContext } from './context';
import { QuantCoreConfig } from '../config';
import {
  MultiStateKalmanFilter,
  computeKalmanVelocity,
} from '../models/kalman';
import { reconstructMicrostructure } from '../models/microstructure';
import { HiddenMarkovModel, detectRegime } from '../models/regime';
import { noiseFilter } from '../models/noise-filter';
import {
  liquidityField,
  computeLiquidityStress,
  detectLiquidityCrisis,
} from '../models/liquidity';
import { bayesianFusion } from '../models/bayesian';
import { TradingAgent, State } from '../models/decision-agent';
import { logRegimeChange } from '../services/logger';
import {
  updateNoiseScore,
  updateLiquidityPressure,
  updateRegimeState,
  updateSignalProbability,
} from '../services/metrics';

// ─── Stage 1: Ingest / Data Normalization ───

export function stageIngest(
  ctx: PipelineContext,
  marketContext: MarketContext,
  trades: any[],
  orderBook: any,
  liquidations: { long: number; short: number }
): PipelineContext {
  ctx.marketContext = marketContext;
  ctx.recentTrades = trades;
  ctx.orderBookHistory = ctx.orderBookHistory.concat(orderBook).slice(-100);
  ctx.liquidations = liquidations;
  return ctx;
}

// ─── Stage 2: Feature Extraction ───

export function stageFeatures(
  ctx: PipelineContext,
  kalman: MultiStateKalmanFilter
): PipelineContext {
  try {
    const { symbol, marketContext } = ctx;
    if (!marketContext) return ctx;

    // Kalman filter update
    const estimate = kalman.update(symbol, marketContext.price);
    const deviation = kalman.getDeviation(symbol, marketContext.price);

    // Track previous estimate for velocity
    const prevEstimate = ctx.kalmanState?.estimate ?? marketContext.price;
    const timeDelta = marketContext.timestamp - (ctx.marketContext?.timestamp ?? marketContext.timestamp - 60000);

    ctx.kalmanState = {
      estimate: estimate ?? marketContext.price,
      deviation: deviation ?? 0,
      velocity: computeKalmanVelocity(estimate ?? marketContext.price, prevEstimate, Math.max(timeDelta, 1)),
      errorCovariance: 0, // simplified
    };

    // Microstructure from recent trades
    if (ctx.recentTrades.length > 0 && ctx.orderBookHistory.length > 0) {
      const lastOb = ctx.orderBookHistory[ctx.orderBookHistory.length - 1];
      ctx.microstructure = reconstructMicrostructure(ctx.recentTrades, lastOb);
    }
  } catch (err) {
    ctx.errors.push({
      stage: 'features',
      message: `Feature extraction failed: ${(err as Error).message}`,
      error: err as Error,
      timestamp: Date.now(),
    });
  }

  return ctx;
}

// ─── Stage 3: Regime Detection ───

export function stageRegime(
  ctx: PipelineContext,
  hmm: HiddenMarkovModel
): PipelineContext {
  try {
    const { marketContext } = ctx;
    if (!marketContext) return ctx;

    ctx.previousRegime = ctx.regime;
    const detectedRegime = detectRegime(marketContext, hmm);
    ctx.regime = detectedRegime;

    // HMM forward probs
    const obs = [
      marketContext.price / 10000,
      marketContext.volatility,
      marketContext.openInterest || 0,
      marketContext.fundingRate || 0,
      marketContext.liquidationLong - marketContext.liquidationShort,
    ];
    ctx.regimeProbabilities = hmm.forward(obs);

    // Log regime change
    if (ctx.previousRegime && ctx.previousRegime !== detectedRegime) {
      logRegimeChange(ctx.symbol, ctx.previousRegime, detectedRegime, Math.max(...ctx.regimeProbabilities));
    }

    // Update metrics
    updateRegimeState(ctx.symbol, detectedRegime, 1);
  } catch (err) {
    ctx.errors.push({
      stage: 'regime',
      message: `Regime detection failed: ${(err as Error).message}`,
      error: err as Error,
      timestamp: Date.now(),
    });
  }

  return ctx;
}

// ─── Stage 4: Noise Filtering ───

export function stageNoise(
  ctx: PipelineContext,
  tradeCount: number,
  whaleCount: number,
  orderBookSweeps: number
): PipelineContext {
  try {
    const { marketContext } = ctx;
    if (!marketContext) return ctx;

    ctx.noise = noiseFilter(marketContext, tradeCount, whaleCount, orderBookSweeps);
    ctx.isMarketClean = ctx.noise.isClean;

    // Update metrics
    updateNoiseScore(ctx.symbol, ctx.noise.noiseScore);
  } catch (err) {
    ctx.errors.push({
      stage: 'noise',
      message: `Noise filtering failed: ${(err as Error).message}`,
      error: err as Error,
      timestamp: Date.now(),
    });
  }

  return ctx;
}

// ─── Stage 5: Liquidity Analysis ───

export function stageLiquidity(
  ctx: PipelineContext,
  orderBookDepth: number,
  recentPriceMoves: number[]
): PipelineContext {
  try {
    const { marketContext } = ctx;
    if (!marketContext) return ctx;

    ctx.liquidityPressure = liquidityField(marketContext);
    ctx.liquidityStress = computeLiquidityStress(marketContext, orderBookDepth);
    ctx.isLiquidityCrisis = detectLiquidityCrisis(marketContext, orderBookDepth, recentPriceMoves);

    if (ctx.isLiquidityCrisis) {
      ctx.warnings.push(`LIQUIDITY_CRISIS: depth=${orderBookDepth}, vol=${marketContext.volatility}`);
    }

    // Update metrics
    updateLiquidityPressure(ctx.symbol, ctx.liquidityPressure.pressure);
  } catch (err) {
    ctx.errors.push({
      stage: 'liquidity',
      message: `Liquidity analysis failed: ${(err as Error).message}`,
      error: err as Error,
      timestamp: Date.now(),
    });
  }

  return ctx;
}

// ─── Stage 6: Bayesian Fusion ───

export function stageBayesian(
  ctx: PipelineContext,
  prior: number
): PipelineContext {
  try {
    const { marketContext, microstructure, regime, liquidityPressure } = ctx;
    if (!marketContext || !regime) return ctx;

    // Build signals from features
    const momentumSignal = ctx.kalmanState
      ? ctx.kalmanState.velocity > 0 ? 'BULLISH' as const : ctx.kalmanState.velocity < 0 ? 'BEARISH' as const : 'NEUTRAL' as const
      : 'NEUTRAL' as const;

    const liqStressSignal = liquidityPressure
      ? liquidityPressure.direction === 'SHORTS_COVERING' ? 'SHORT_PRESSURE' as const
        : liquidityPressure.direction === 'LONGS_UNWINDING' ? 'LONG_PRESSURE' as const
        : 'NONE' as const
      : 'NONE' as const;

    const volSignal = marketContext.volatility > 0.7 ? 'HIGH' as const
      : marketContext.volatility < 0.3 ? 'LOW' as const
      : 'MID' as const;

    const microSignal = microstructure
      ? microstructure.aggressionImbalance > 0.3 ? 'STRONG_BUYING' as const
        : microstructure.aggressionImbalance < -0.3 ? 'STRONG_SELLING' as const
        : 'BALANCED' as const
      : 'BALANCED' as const;

    ctx.signals = {
      momentum: momentumSignal,
      liquidityStress: liqStressSignal,
      volatility: volSignal,
      microstructure: microSignal,
    };

    ctx.bayesianOutput = bayesianFusion(ctx.signals, regime, prior);

    // Update metrics
    updateSignalProbability(ctx.symbol, 'long', ctx.bayesianOutput.probabilityLong);
    updateSignalProbability(ctx.symbol, 'short', ctx.bayesianOutput.probabilityShort);
  } catch (err) {
    ctx.errors.push({
      stage: 'bayesian',
      message: `Bayesian fusion failed: ${(err as Error).message}`,
      error: err as Error,
      timestamp: Date.now(),
    });
  }

  return ctx;
}

// ─── Stage 7: Decision Making ───

export function stageDecision(
  ctx: PipelineContext,
  agent: TradingAgent,
  config: QuantCoreConfig
): PipelineContext {
  try {
    if (!ctx.marketContext || !ctx.regime || !ctx.bayesianOutput) return ctx;

    // Map RegimeType to index
    const regimeIndexMap: Record<string, number> = {
      'CHOPPY': 0,
      'TRENDING_UP': 1,
      'TRENDING_DOWN': 2,
      'LIQUIDATION_DRIVEN': 3,
      'HIGH_VOL': 4,
    };

    // Build RL agent state
    const agentState: State = {
      probabilityLong: ctx.bayesianOutput.probabilityLong,
      probabilityShort: ctx.bayesianOutput.probabilityShort,
      volatility: ctx.marketContext.volatility,
      noiseScore: ctx.noise?.noiseScore ?? 0,
      regimeIndex: regimeIndexMap[ctx.regime] ?? 0,
      liquidityPressure: ctx.liquidityPressure?.pressure ?? 0,
      kalmanDeviation: ctx.kalmanState?.deviation ?? 0,
    };

    ctx.agentState = agentState;

    // Get RL agent decision
    ctx.agentAction = agent.predict(agentState);

    // Final decision is a fusion of Bayesian and RL
    const bayesianProbLong = ctx.bayesianOutput.probabilityLong;
    const rlDecision = ctx.agentAction.type;

    // Weighted fusion: 60% RL, 40% Bayesian
    const fusionConfidence = ctx.agentAction.confidence * 0.6 + ctx.bayesianOutput.confidence * 0.4;

    let finalDecision: 'LONG' | 'SHORT' | 'HOLD';
    if (rlDecision === 'LONG' && bayesianProbLong > 0.4) {
      finalDecision = 'LONG';
    } else if (rlDecision === 'SHORT' && bayesianProbLong < 0.6) {
      finalDecision = 'SHORT';
    } else {
      finalDecision = 'HOLD';
    }

    ctx.finalDecision = finalDecision;
    ctx.finalConfidence = fusionConfidence;

    // Risk overlay: don't trade if liquidity crisis or high noise
    const riskOverrides = ctx.isLiquidityCrisis === true || !ctx.isMarketClean;

    ctx.shouldTrade = finalDecision !== 'HOLD' && fusionConfidence > 0.4 && !riskOverrides;
    ctx.positionSize = ctx.shouldTrade
      ? config.pipeline.maxTradeSize * fusionConfidence * (ctx.bayesianOutput.confidence)
      : 0;

    if (riskOverrides) {
      ctx.warnings.push(
        `RISK_OVERRIDE: liquidityCrisis=${ctx.isLiquidityCrisis}, marketClean=${ctx.isMarketClean}`
      );
    }
  } catch (err) {
    ctx.errors.push({
      stage: 'decision',
      message: `Decision making failed: ${(err as Error).message}`,
      error: err as Error,
      timestamp: Date.now(),
    });
  }

  return ctx;
}