/**
 * Quant-Core: End-to-End Probabilistic Trading Intelligence
 *
 * Entry point for the LEVEL 4 quant-core pipeline.
 * Initializes all subsystems (config, pipeline, metrics, connectors)
 * and provides:
 *   1. A PipelineOrchestrator that sequences data through all model stages
 *   2. Synthetic data mode for backtesting / simulation
 *   3. Metrics server (Prometheus) for observability
 *   4. Graceful shutdown
 *
 * Architecture:
 *   Ingest → Kalman Filter + Microstructure → HMM Regime Detection
 *   → Noise Filter → Liquidity Analysis → Bayesian Fusion
 *   → RL Agent Decision → Risk Overlay → Execution Signal
 */

import { loadConfig, QuantCoreConfig } from './config';
import { PipelineOrchestrator } from './pipeline/orchestrator';
import { generateSyntheticData, runMonteCarloSimulation, Backtester, BacktestConfig } from './backtester/backtester';
import { TradingAgent } from './models/decision-agent';
import { PipelineContext } from './pipeline/context';
import { MarketContext } from './schemas';
import { logInfo, logError, logBacktestResult } from './services/logger';
import { getMetrics } from './services/metrics';

// ─── Initialization ───

let orchestrator: PipelineOrchestrator | null = null;
let config: QuantCoreConfig;

/**
 * Initialize the quant-core system.
 * Call this once at application startup.
 */
export async function initialize(overrides?: Partial<QuantCoreConfig>): Promise<PipelineOrchestrator> {
  config = loadConfig(overrides);

  logInfo('Quant-Core initializing', {
    symbols: config.pipeline.symbols,
    intervalMs: config.pipeline.updateIntervalMs,
    liveTrading: config.pipeline.enableLiveTrading,
    backtesting: config.pipeline.enableBacktesting,
  });

  orchestrator = new PipelineOrchestrator({
    config,
    onDecision: handleDecision,
    onError: handlePipelineError,
    onCycleComplete: handleCycleComplete,
  });

  logInfo('Quant-Core initialized successfully', {
    models: ['kalman', 'hmm', 'bayesian', 'rl_agent', 'noise_filter', 'liquidity', 'microstructure'],
    pipelineStages: ['ingest', 'features', 'regime', 'noise', 'liquidity', 'bayesian', 'decision'],
  });

  return orchestrator;
}

/**
 * Process a single market data point through the full pipeline.
 * This is the main entry point for real-time data feeds.
 */
export async function processMarketData(
  symbol: string,
  marketContext: MarketContext,
  trades: any[] = [],
  orderBook: any = {},
  liquidations: { long: number; short: number } = { long: 0, short: 0 }
): Promise<PipelineContext | null> {
  if (!orchestrator) {
    logError(new Error('Quant-Core not initialized. Call initialize() first.'));
    return null;
  }

  return orchestrator.processSymbol(symbol, marketContext, trades, orderBook, liquidations);
}

/**
 * Run a complete backtest with the current model configuration.
 * Uses the internal orchestrator pipeline for decision-making.
 */
export async function runBacktest(
  symbol: string,
  dataPoints: MarketContext[],
  initialCapital: number = 10000,
  positionSize: number = 0.1,
  feeRate: number = 0.001
): Promise<any> {
  if (!orchestrator) {
    logError(new Error('Quant-Core not initialized. Call initialize() first.'));
    return null;
  }

  logInfo('Starting backtest', { symbol, dataPoints: dataPoints.length, initialCapital });

  const backtestConfig: BacktestConfig = {
    initialCapital,
    positionSize,
    feeRate,
    slippage: 0.001,
    maxPositionSize: 1.0,
  };

  const agent = new TradingAgent(7);
  const backtester = new Backtester(agent, backtestConfig);

  // Convert data points to DataPoint format
  const dataFeed = dataPoints.map(ctx => ({
    ctx,
    trades: [],
    orderBook: {
      bids: [[ctx.price * 0.999, 1000]],
      asks: [[ctx.price * 1.001, 1000]],
      bidsDepth: 1000000,
      asksDepth: 1000000,
    },
  }));

  const results = await backtester.run(dataFeed);

  logBacktestResult(
    symbol,
    results.totalPnL,
    results.winRate,
    results.sharpeRatio,
    results.maxDrawdown
  );

  return results;
}

/**
 * Run a Monte Carlo simulation to assess strategy robustness.
 */
export async function runMonteCarlo(
  _symbol: string,
  dataPoints: MarketContext[],
  numSimulations: number = 100,
  noiseLevel: number = 0.01
): Promise<{ meanPnL: number; stdDevPnL: number; confidenceInterval: [number, number] }> {
  if (!orchestrator) {
    logError(new Error('Quant-Core not initialized. Call initialize() first.'));
    return { meanPnL: 0, stdDevPnL: 0, confidenceInterval: [0, 0] };
  }

  const agent = new TradingAgent(7);
  const backtestConfig: BacktestConfig = {
    initialCapital: 10000,
    positionSize: 0.1,
    feeRate: 0.001,
    slippage: 0.001,
    maxPositionSize: 1.0,
  };
  const backtester = new Backtester(agent, backtestConfig);

  const dataFeed = dataPoints.map(ctx => ({
    ctx,
    trades: [],
    orderBook: {
      bids: [[ctx.price * 0.999, 1000]],
      asks: [[ctx.price * 1.001, 1000]],
      bidsDepth: 1000000,
      asksDepth: 1000000,
    },
  }));

  return runMonteCarloSimulation(backtester, dataFeed, numSimulations, noiseLevel);
}

/**
 * Get the current pipeline status and statistics.
 */
export function getStatus(): any {
  if (!orchestrator) {
    return { initialized: false, status: 'not_initialized' };
  }

  const stats = orchestrator.getStats();
  const contexts: Record<string, any> = {};
  for (const [symbol, ctx] of orchestrator.getAllContexts()) {
    contexts[symbol] = {
      regime: ctx.regime,
      regimeProbabilities: ctx.regimeProbabilities,
      finalDecision: ctx.finalDecision,
      finalConfidence: ctx.finalConfidence,
      shouldTrade: ctx.shouldTrade,
      isMarketClean: ctx.isMarketClean,
      isLiquidityCrisis: ctx.isLiquidityCrisis,
      errorCount: ctx.errors.length,
      warningCount: ctx.warnings.length,
      lastUpdated: ctx.startedAt,
    };
  }

  return {
    initialized: true,
    version: '1.0.0',
    config: {
      symbols: config.pipeline.symbols,
      updateIntervalMs: config.pipeline.updateIntervalMs,
      liveTrading: config.pipeline.enableLiveTrading,
    },
    pipeline: stats,
    contexts,
  };
}

/**
 * Get Prometheus metrics
 */
export async function getPrometheusMetrics(): Promise<string> {
  return getMetrics();
}

/**
 * Shutdown the quant-core system gracefully.
 */
export async function shutdown(): Promise<void> {
  logInfo('Quant-Core shutting down...');

  if (orchestrator) {
    orchestrator.dispose();
    orchestrator = null;
  }

  logInfo('Quant-Core shutdown complete');
}

// ─── Internal Callbacks ───

async function handleDecision(ctx: PipelineContext): Promise<void> {
  if (ctx.shouldTrade && ctx.finalDecision && ctx.positionSize) {
    logInfo('EXECUTION SIGNAL', {
      symbol: ctx.symbol,
      decision: ctx.finalDecision,
      confidence: ctx.finalConfidence,
      positionSize: ctx.positionSize,
      regime: ctx.regime,
      price: ctx.marketContext?.price,
    });
  }
}

async function handlePipelineError(ctx: PipelineContext): Promise<void> {
  for (const err of ctx.errors) {
    logError(new Error(err.message), {
      symbol: ctx.symbol,
      stage: err.stage,
      cycleId: ctx.cycleId,
    });
  }
}

async function handleCycleComplete(_ctx: PipelineContext): Promise<void> {
  // Future: publish to Kafka, update state store, etc.
}

// ─── Self-contained Execution (for direct `tsx src/index.ts` development) ───

async function main() {
  logInfo('Quant-Core starting in standalone mode...');

  await initialize();

  // Generate synthetic data for testing
  const dataPoints = generateSyntheticData('BTCUSDT', 100);
  const startTime = Date.now();
  let cycleCount = 0;

  for (const dp of dataPoints) {
    await processMarketData(
      'BTCUSDT',
      dp.ctx,
      dp.trades,
      dp.orderBook,
      { long: dp.ctx.liquidationLong, short: dp.ctx.liquidationShort }
    );
    cycleCount++;
  }

  const elapsed = Date.now() - startTime;
  const status = getStatus();

  logInfo('Standalone test complete', {
    cyclesProcessed: cycleCount,
    elapsedMs: elapsed,
    avgMsPerCycle: elapsed / cycleCount,
    btcusdt: status.contexts?.BTCUSDT,
  });

  console.log('\n=== Quant-Core System Status ===');
  console.log(JSON.stringify(status, null, 2));
  console.log('\nPipeline processed', cycleCount, 'data points in', elapsed, 'ms');
  console.log('Average:', (elapsed / cycleCount).toFixed(2), 'ms per cycle');

  await shutdown();
}

// Run standalone if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export default {
  initialize,
  processMarketData,
  runBacktest,
  runMonteCarlo,
  getStatus,
  getPrometheusMetrics,
  shutdown,
};