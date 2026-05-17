/**
 * Bridge between legacy `core/` analysis engine and `quant-core/` Level 4 pipeline.
 *
 * This adapter allows:
 *   1. Vercel API endpoints (which use `core/engine/analyze.ts`) to optionally
 *      enrich decisions with quant-core's advanced models
 *   2. quant-core pipeline outcomes to be expressed in the legacy `AnalysisOutput` format
 *   3. The system to compare legacy vs Level 4 decisions side-by-side
 *
 * Usage:
 *   import { enrichWithPipeline } from '../../core/bridge/pipeline-adapter';
 *   const enhancedOutput = await enrichWithPipeline(snapshot, legacyOutput);
 */

import { MarketSnapshot, AnalysisOutput } from '../engine/analyze';
import { MarketContext } from '../../quant-core/src/schemas';
import { PipelineContext } from '../../quant-core/src/pipeline/context';

export interface BridgedAnalysis extends AnalysisOutput {
  /** quant-core pipeline context (if available) */
  quantCore?: {
    pipelineDecision: string | null;
    pipelineConfidence: number | null;
    bayesianProbLong: number | null;
    bayesianProbShort: number | null;
    regime: string | null;
    kalmanVelocity: number | null;
    liquidityPressure: number | null;
    noiseScore: number | null;
    isLiquidityCrisis: boolean | null;
    isMarketClean: boolean | null;
  };

  /** Side-by-side comparison of outputs */
  comparison?: {
    directionMatch: boolean;
    confidenceDelta: number;
  };
}

/**
 * Convert a legacy MarketSnapshot into a quant-core MarketContext.
 * This enables quant-core to process data from the legacy engine.
 */
export function snapshotToMarketContext(
  snapshot: MarketSnapshot
): MarketContext {
  const { candles, orderbook, currentPrice, timestamp } = snapshot;

  const latestCandle = candles[candles.length - 1];
  const bidVol = orderbook.bids.slice(0, 10).reduce((a: number, b: [number, number]) => a + b[1], 0);
  const askVol = orderbook.asks.slice(0, 10).reduce((a: number, b: [number, number]) => a + b[1], 0);
  const orderBookImbalance = bidVol + askVol > 0
    ? (bidVol - askVol) / (bidVol + askVol)
    : 0;

  return {
    symbol: 'UNKNOWN', // caller should override
    timestamp: timestamp || Date.now(),
    price: currentPrice,
    volume: latestCandle?.volume || 0,
    buyVolume: 0,
    sellVolume: 0,
    orderBookImbalance,
    liquidationLong: 0,
    liquidationShort: 0,
    volatility: 0, // computed from candles if needed
  };
}

/**
 * Extract quant-core pipeline results into a plain object.
 * Returns null if pipeline context is not from a processed cycle.
 */
export function extractQuantCoreOutput(
  ctx: PipelineContext | undefined | null
): BridgedAnalysis['quantCore'] | undefined {
  if (!ctx || !ctx.regime) return undefined;

  return {
    pipelineDecision: ctx.finalDecision ?? null,
    pipelineConfidence: ctx.finalConfidence ?? null,
    bayesianProbLong: ctx.bayesianOutput?.probabilityLong ?? null,
    bayesianProbShort: ctx.bayesianOutput?.probabilityShort ?? null,
    regime: ctx.regime ?? null,
    kalmanVelocity: ctx.kalmanState?.velocity ?? null,
    liquidityPressure: ctx.liquidityPressure?.pressure ?? null,
    noiseScore: ctx.noise?.noiseScore ?? null,
    isLiquidityCrisis: ctx.isLiquidityCrisis ?? null,
    isMarketClean: ctx.isMarketClean ?? null,
  };
}

/**
 * Enrich a legacy analysis output with quant-core pipeline results.
 * Also computes a side-by-side comparison.
 */
export function enrichWithPipeline(
  legacyOutput: AnalysisOutput,
  pipelineCtx?: PipelineContext | null
): BridgedAnalysis {
  const quantCore = pipelineCtx ? extractQuantCoreOutput(pipelineCtx) : undefined;

  let comparison: BridgedAnalysis['comparison'] = undefined;
  if (quantCore?.pipelineDecision && legacyOutput.direction) {
    const qcDirection = quantCore.pipelineDecision === 'LONG' ? 'ABOVE'
      : quantCore.pipelineDecision === 'SHORT' ? 'BELOW'
      : null;

    comparison = {
      directionMatch: qcDirection === legacyOutput.direction,
      confidenceDelta: quantCore.pipelineConfidence !== null
        ? quantCore.pipelineConfidence - legacyOutput.confidence
        : 0,
    };
  }

  return {
    ...legacyOutput,
    quantCore,
    comparison,
  };
}