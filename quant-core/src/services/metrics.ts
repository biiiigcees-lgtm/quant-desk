import promClient from 'prom-client';

export const register = new promClient.Registry();

// Default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const inferenceLatency = new promClient.Histogram({
  name: 'inference_latency_seconds',
  help: 'Time taken for model inference',
  labelNames: ['model_type'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

export const decisionCount = new promClient.Counter({
  name: 'decision_count_total',
  help: 'Total number of trading decisions made',
  labelNames: ['action', 'symbol'],
  registers: [register],
});

export const signalProbability = new promClient.Gauge({
  name: 'signal_probability',
  help: 'Current signal probability for long/short',
  labelNames: ['symbol', 'direction'],
  registers: [register],
});

export const regimeState = new promClient.Gauge({
  name: 'regime_state',
  help: 'Current market regime state',
  labelNames: ['symbol', 'regime'],
  registers: [register],
});

export const dataFeedStatus = new promClient.Gauge({
  name: 'data_feed_status',
  help: 'Status of data feeds (1=connected, 0=disconnected)',
  labelNames: ['exchange', 'feed_type'],
  registers: [register],
});

export const backtestPnL = new promClient.Gauge({
  name: 'backtest_pnl',
  help: 'Current backtest PnL',
  labelNames: ['symbol', 'strategy'],
  registers: [register],
});

export const noiseScore = new promClient.Gauge({
  name: 'noise_score',
  help: 'Current market noise score',
  labelNames: ['symbol'],
  registers: [register],
});

export const liquidityPressure = new promClient.Gauge({
  name: 'liquidity_pressure',
  help: 'Current liquidity pressure',
  labelNames: ['symbol'],
  registers: [register],
});

export function recordInference(modelType: string, duration: number): void {
  inferenceLatency.observe({ model_type: modelType }, duration);
}

export function recordDecision(action: string, symbol: string): void {
  decisionCount.inc({ action, symbol });
}

export function updateSignalProbability(symbol: string, direction: 'long' | 'short', probability: number): void {
  signalProbability.set({ symbol, direction }, probability);
}

export function updateRegimeState(symbol: string, regime: string, state: number): void {
  regimeState.set({ symbol, regime }, state);
}

export function updateDataFeedStatus(exchange: string, feedType: string, connected: boolean): void {
  dataFeedStatus.set({ exchange, feed_type: feedType }, connected ? 1 : 0);
}

export function updateBacktestPnL(symbol: string, strategy: string, pnl: number): void {
  backtestPnL.set({ symbol, strategy }, pnl);
}

export function updateNoiseScore(symbol: string, score: number): void {
  noiseScore.set({ symbol }, score);
}

export function updateLiquidityPressure(symbol: string, pressure: number): void {
  liquidityPressure.set({ symbol }, pressure);
}

export async function getMetrics(): Promise<string> {
  return await register.metrics();
}
