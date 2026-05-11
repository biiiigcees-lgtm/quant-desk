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

export interface AgentTaskContext {
  requestId: string;
  contractId: string;
  triggerEvent: string;
  timestamp: number;
  payload: unknown;
  sharedState?: Record<string, unknown>;
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

export interface AgentRunResult<TOutput = unknown> {
  agent: AgentKind;
  output: TOutput;
  metrics: AgentRunMetrics;
}

export interface AgentProviderResult {
  model: string;
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  fallbackDepth: number;
}

export interface AgentProvider {
  run(systemPrompt: string, userPrompt: string, preferredModels: string[]): Promise<AgentProviderResult>;
}

export interface AgentSpec<TOutput = unknown> {
  kind: AgentKind;
  preferredModels: string[];
  debounceMs: number;
  cacheTtlMs: number;
  buildSystemPrompt(): string;
  buildUserPrompt(context: AgentTaskContext): string;
  parseOutput(rawText: string): TOutput;
}

export interface AgentRoute {
  triggerEvent: string;
  agents: AgentKind[];
}

export interface AgentSchedulerOptions {
  maxParallel: number;
}

export interface AgentCircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}
