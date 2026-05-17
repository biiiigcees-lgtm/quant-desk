import { MarketContext } from '../schemas';
import { QuantCoreConfig } from '../config';
import { PipelineContext, createPipelineContext } from './context';
import {
  stageIngest,
  stageFeatures,
  stageRegime,
  stageNoise,
  stageLiquidity,
  stageBayesian,
  stageDecision,
} from './stages';
import {
  MultiStateKalmanFilter,
} from '../models/kalman';
import { HiddenMarkovModel } from '../models/regime';
import { TradingAgent, ExperienceReplayBuffer } from '../models/decision-agent';
import { logTradeDecision, logSignalFusion, logError } from '../services/logger';
import { recordDecision, recordInference } from '../services/metrics';

export type PipelineCallback = (ctx: PipelineContext) => void | Promise<void>;

export interface OrchestratorOptions {
  config: QuantCoreConfig;
  onDecision?: PipelineCallback;
  onError?: PipelineCallback;
  onCycleComplete?: PipelineCallback;
}

/**
 * PipelineOrchestrator manages the complete quant-core pipeline:
 * Ingest → Features → Regime → Noise → Liquidity → Bayesian → Decision
 *
 * It maintains shared state (Kalman filters, HMM, agent) across cycles
 * and provides hooks for decision callbacks, error handling, and cycle completion.
 */
export class PipelineOrchestrator {
  public readonly config: QuantCoreConfig;

  // Shared model instances (persist across cycles)
  public readonly kalmanFilter: MultiStateKalmanFilter;
  public readonly hmm: HiddenMarkovModel;
  public readonly agent: TradingAgent;
  public readonly replayBuffer: ExperienceReplayBuffer;

  // Per-symbol pipeline contexts
  private contexts: Map<string, PipelineContext> = new Map();

  // Callbacks
  private onDecision: PipelineCallback | null;
  private onError: PipelineCallback | null;
  private onCycleComplete: PipelineCallback | null;

  // Running state
  private isRunning: boolean = false;
  private cycleCount: number = 0;
  private lastError: Error | null = null;

  constructor(options: OrchestratorOptions) {
    this.config = options.config;
    this.onDecision = options.onDecision ?? null;
    this.onError = options.onError ?? null;
    this.onCycleComplete = options.onCycleComplete ?? null;

    // Initialize shared models
    this.kalmanFilter = new MultiStateKalmanFilter();
    this.hmm = new HiddenMarkovModel(this.config.models.hmmStates);
    this.agent = new TradingAgent(7);
    this.agent.setEpsilon(this.config.models.agentEpsilon);
    this.replayBuffer = new ExperienceReplayBuffer(this.config.models.replayBufferSize);

    // Register symbols in Kalman filter
    for (const symbol of this.config.pipeline.symbols) {
      this.kalmanFilter.addSymbol(symbol, 0);
      this.contexts.set(symbol, createPipelineContext(symbol));
    }
  }

  /**
   * Run one full pipeline cycle for a symbol with the given data.
   * This is the main entry point for processing a market update.
   */
  async processSymbol(
    symbol: string,
    marketContext: MarketContext,
    trades: any[],
    orderBook: any,
    liquidations: { long: number; short: number }
  ): Promise<PipelineContext> {
    const startTime = Date.now();

    // Get or create context for this symbol
    let ctx = this.contexts.get(symbol);
    if (!ctx) {
      ctx = createPipelineContext(symbol);
      this.kalmanFilter.addSymbol(symbol, marketContext.price);
    }

    try {
      // Stage 1: Ingest
      ctx = stageIngest(ctx, marketContext, trades, orderBook, liquidations);

      // Stage 2: Feature Extraction
      ctx = stageFeatures(ctx, this.kalmanFilter);

      // Stage 3: Regime Detection
      ctx = stageRegime(ctx, this.hmm);

      // Stage 4: Noise Filtering
      const tradeCount = trades.length;
      const whaleCount = 0; // Would come from whale detection module
      const orderBookSweeps = 0; // Would come from order book sweep detection
      ctx = stageNoise(ctx, tradeCount, whaleCount, orderBookSweeps);

      // Stage 5: Liquidity Analysis
      const bidsDepth = Array.isArray(orderBook?.bids)
        ? orderBook.bids.reduce((s: number, b: [number, number]) => s + b[1], 0)
        : 100000;
      const asksDepth = Array.isArray(orderBook?.asks)
        ? orderBook.asks.reduce((s: number, a: [number, number]) => s + a[1], 0)
        : 100000;
      const orderBookDepth = bidsDepth + asksDepth;
      const recentPriceMoves: number[] = []; // Would track recent price movements
      ctx = stageLiquidity(ctx, orderBookDepth, recentPriceMoves);

      // Stage 6: Bayesian Fusion
      ctx = stageBayesian(ctx, this.config.models.bayesianPrior);

      // Stage 7: Decision
      ctx = stageDecision(ctx, this.agent, this.config);

      // Update context in map
      this.contexts.set(symbol, ctx);

      // Record metrics
      recordInference('pipeline', Date.now() - startTime);
      if (ctx.finalDecision) {
        recordDecision(ctx.finalDecision, symbol);
      }

      // Log decision
      if (ctx.finalDecision && ctx.finalConfidence) {
        logTradeDecision(symbol, ctx.finalDecision, ctx.finalConfidence, ctx.regime ?? 'UNKNOWN');
      }

      // Log signal fusion
      if (ctx.signals && ctx.bayesianOutput) {
        logSignalFusion(symbol, ctx.signals as unknown as Record<string, any>, ctx.bayesianOutput.probabilityLong, ctx.bayesianOutput.probabilityShort);
      }

      // Invoke decision callback
      if (this.onDecision && ctx.finalDecision) {
        await this.onDecision(ctx);
      }

      this.cycleCount++;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.lastError = error;
      ctx.errors.push({
        stage: 'orchestrator',
        message: `Pipeline cycle failed: ${error.message}`,
        error,
        timestamp: Date.now(),
      });
      logError(error, { symbol, cycleId: ctx.cycleId });

      if (this.onError) {
        await this.onError(ctx);
      }
    }

    // Invoke cycle complete callback
    if (this.onCycleComplete) {
      await this.onCycleComplete(ctx);
    }

    return ctx;
  }

  /**
   * Process all symbols with the same data template (for synthetic/backtest data)
   */
  async processAll(
    marketContext: MarketContext,
    trades: any[],
    orderBook: any,
    liquidations: { long: number; short: number }
  ): Promise<Map<string, PipelineContext>> {
    const results = new Map<string, PipelineContext>();

    for (const symbol of this.config.pipeline.symbols) {
      const ctx = await this.processSymbol(
        symbol,
        { ...marketContext, symbol },
        trades,
        orderBook,
        liquidations
      );
      results.set(symbol, ctx);
    }

    return results;
  }

  /**
   * Get current context for a symbol
   */
  getContext(symbol: string): PipelineContext | undefined {
    return this.contexts.get(symbol);
  }

  /**
   * Get all current contexts
   */
  getAllContexts(): Map<string, PipelineContext> {
    return new Map(this.contexts);
  }

  /**
   * Get cycle statistics
   */
  getStats(): {
    cycleCount: number;
    isRunning: boolean;
    lastError: Error | null;
    contextsCount: number;
    replaySize: number;
  } {
    return {
      cycleCount: this.cycleCount,
      isRunning: this.isRunning,
      lastError: this.lastError,
      contextsCount: this.contexts.size,
      replaySize: this.replayBuffer.size(),
    };
  }

  /**
   * Reset the orchestrator (clear contexts, reset models)
   */
  reset(): void {
    this.contexts.clear();
    this.replayBuffer.clear();
    this.cycleCount = 0;
    this.lastError = null;

    for (const symbol of this.config.pipeline.symbols) {
      this.kalmanFilter.addSymbol(symbol, 0);
      this.contexts.set(symbol, createPipelineContext(symbol));
    }
  }

  /**
   * Dispose the orchestrator (clean up resources)
   */
  dispose(): void {
    this.contexts.clear();
    this.onDecision = null;
    this.onError = null;
    this.onCycleComplete = null;
  }
}