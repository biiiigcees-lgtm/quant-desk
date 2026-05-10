import { EventBus } from '../../../core/event-bus/bus.js';
import { EVENTS } from '../../../core/event-bus/events.js';
import { DecisionSnapshotEvent } from '../../../core/schemas/events.js';
import { AGENT_SPECS } from '../agents/index.js';
import {
  AgentCircuitBreakerOptions,
  AgentKind,
  AgentProvider,
  AgentTaskContext,
  AgentRunResult,
  AgentSchedulerOptions,
} from '../types.js';

interface RouterOptions {
  enabled: boolean;
  defaultContractId: string;
  shadowMode: boolean;
  scheduler: AgentSchedulerOptions;
  circuitBreaker: AgentCircuitBreakerOptions;
}

interface CachedAgentResult {
  expiresAt: number;
  output: unknown;
  model: string;
}

export class AiAgentRouterService {
  private readonly lastRunByAgentKey = new Map<string, number>();
  private readonly cache = new Map<string, CachedAgentResult>();
  private readonly consecutiveFailures = new Map<AgentKind, number>();
  private readonly breakerOpenUntil = new Map<AgentKind, number>();

  constructor(
    private readonly bus: EventBus,
    private readonly provider: AgentProvider,
    private readonly options: RouterOptions,
  ) {}

  start(): void {
    if (!this.options.enabled) {
      return;
    }

    this.bus.on<DecisionSnapshotEvent>(EVENTS.DECISION_SNAPSHOT, (snapshot) => this.routeSnapshot(snapshot));
  }

  private async routeSnapshot(snapshot: DecisionSnapshotEvent): Promise<void> {
    const agents = routeAgentsForTrigger(snapshot.triggerEvent);
    if (agents.length === 0) {
      return;
    }

    const dedupeKey = `${snapshot.triggerEvent}:${snapshot.snapshot_id}`;
    this.bus.emit(EVENTS.AI_ROUTING_DECISION, {
      triggerEvent: snapshot.triggerEvent,
      contractId: snapshot.contractId,
      snapshot_id: snapshot.snapshot_id,
      market_state_hash: snapshot.market_state_hash,
      agents,
      dedupeKey,
      timestamp: Date.now(),
    });

    const tasks: Array<() => Promise<void>> = [];
    for (const agent of agents) {
      const spec = AGENT_SPECS[agent];
      const agentKey = `${snapshot.contractId}:${agent}`;
      const now = Date.now();
      const lastRun = this.lastRunByAgentKey.get(agentKey) ?? 0;
      if (now - lastRun < spec.debounceMs) {
        continue;
      }
      this.lastRunByAgentKey.set(agentKey, now);

      tasks.push(async () => {
        const requestId = `${agent}-${now}-${Math.random().toString(36).slice(2, 8)}`;
        const context: AgentTaskContext = {
          requestId,
          contractId: snapshot.contractId,
          triggerEvent: snapshot.triggerEvent,
          timestamp: now,
          snapshotId: snapshot.snapshot_id,
          marketStateHash: snapshot.market_state_hash,
          payload: snapshot,
        };
        await this.runAgent(spec.kind, context);
      });
    }

    await this.executeBatched(tasks, this.options.scheduler.maxParallel);
  }

  private async runAgent(agent: AgentKind, context: AgentTaskContext): Promise<void> {
    const spec = AGENT_SPECS[agent];
    if (this.isCircuitOpen(agent)) {
      this.bus.emit(EVENTS.AI_AGENT_FAILURE, {
        requestId: context.requestId,
        agent,
        contractId: context.contractId,
        triggerEvent: context.triggerEvent,
        snapshot_id: context.snapshotId,
        market_state_hash: context.marketStateHash,
        error: 'circuit-open',
        timestamp: Date.now(),
      });
      return;
    }

    const cacheKey = `${agent}:${context.contractId}:${context.triggerEvent}:${stableHash(context.payload)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.emitResult({
        agent,
        output: cached.output,
        metrics: {
          latencyMs: 0,
          model: cached.model,
          fallbackDepth: 0,
          cacheHit: true,
        },
      }, context);
      return;
    }

    this.bus.emit(EVENTS.AI_AGENT_REQUEST, {
      requestId: context.requestId,
      agent,
      contractId: context.contractId,
      triggerEvent: context.triggerEvent,
      snapshot_id: context.snapshotId,
      market_state_hash: context.marketStateHash,
      timestamp: context.timestamp,
    });

    const startedAt = Date.now();
    try {
      const providerResult = await this.provider.run(
        spec.buildSystemPrompt(),
        spec.buildUserPrompt(context),
        spec.preferredModels,
      );
      const output = spec.parseOutput(providerResult.text);
      const latencyMs = Date.now() - startedAt;
      this.resetFailures(agent);

      this.cache.set(cacheKey, {
        output,
        model: providerResult.model,
        expiresAt: Date.now() + spec.cacheTtlMs,
      });

      if (this.options.shadowMode) {
        this.bus.emit(EVENTS.AI_ORCHESTRATION_METRICS, {
          agent,
          contractId: context.contractId,
          triggerEvent: context.triggerEvent,
          snapshot_id: context.snapshotId,
          market_state_hash: context.marketStateHash,
          latencyMs,
          model: providerResult.model,
          promptTokens: providerResult.promptTokens,
          completionTokens: providerResult.completionTokens,
          totalTokens: providerResult.totalTokens,
          estimatedCostUsd: providerResult.estimatedCostUsd,
          fallbackDepth: providerResult.fallbackDepth,
          cacheHit: false,
          shadowMode: true,
          timestamp: Date.now(),
        });
      } else {
        this.emitResult(
          {
            agent,
            output,
            metrics: {
              latencyMs,
              model: providerResult.model,
              promptTokens: providerResult.promptTokens,
              completionTokens: providerResult.completionTokens,
              totalTokens: providerResult.totalTokens,
              estimatedCostUsd: providerResult.estimatedCostUsd,
              fallbackDepth: providerResult.fallbackDepth,
              cacheHit: false,
            },
          },
          context,
        );
      }
    } catch (error) {
      this.recordFailure(agent);
      this.bus.emit(EVENTS.AI_AGENT_FAILURE, {
        requestId: context.requestId,
        agent,
        contractId: context.contractId,
        triggerEvent: context.triggerEvent,
        snapshot_id: context.snapshotId,
        market_state_hash: context.marketStateHash,
        error: (error as Error).message,
        timestamp: Date.now(),
      });
    }
  }

  private isCircuitOpen(agent: AgentKind): boolean {
    const until = this.breakerOpenUntil.get(agent) ?? 0;
    if (until <= Date.now()) {
      return false;
    }
    return true;
  }

  private recordFailure(agent: AgentKind): void {
    const failures = (this.consecutiveFailures.get(agent) ?? 0) + 1;
    this.consecutiveFailures.set(agent, failures);
    if (failures >= this.options.circuitBreaker.failureThreshold) {
      this.breakerOpenUntil.set(agent, Date.now() + this.options.circuitBreaker.cooldownMs);
      this.consecutiveFailures.set(agent, 0);
    }
  }

  private resetFailures(agent: AgentKind): void {
    this.consecutiveFailures.set(agent, 0);
  }

  private emitResult(result: AgentRunResult<unknown>, context: AgentTaskContext): void {
    this.bus.emit(EVENTS.AI_AGENT_RESPONSE, {
      requestId: context.requestId,
      agent: result.agent,
      contractId: context.contractId,
      triggerEvent: context.triggerEvent,
      snapshot_id: context.snapshotId,
      market_state_hash: context.marketStateHash,
      output: result.output,
      metrics: result.metrics,
      timestamp: Date.now(),
    });

    this.bus.emit(EVENTS.AI_ORCHESTRATION_METRICS, {
      agent: result.agent,
      contractId: context.contractId,
      triggerEvent: context.triggerEvent,
      snapshot_id: context.snapshotId,
      market_state_hash: context.marketStateHash,
      ...result.metrics,
      timestamp: Date.now(),
    });
  }

  private async executeBatched(tasks: Array<() => Promise<void>>, maxParallel: number): Promise<void> {
    if (tasks.length === 0) {
      return;
    }
    const width = Math.max(1, maxParallel);
    for (let i = 0; i < tasks.length; i += width) {
      const chunk = tasks.slice(i, i + width);
      await Promise.all(chunk.map((run) => run()));
    }
  }
}

function routeAgentsForTrigger(triggerEvent: string): AgentKind[] {
  if (triggerEvent === EVENTS.MICROSTRUCTURE) {
    return ['microstructure-intelligence', 'market-analyst'];
  }
  if (triggerEvent === EVENTS.PROBABILITY) {
    return ['probability-calibration', 'risk-governor', 'strategy-evolution', 'market-analyst'];
  }
  if (triggerEvent === EVENTS.EXECUTION_PLAN) {
    return ['execution-intelligence'];
  }
  if (triggerEvent === EVENTS.ANOMALY) {
    return ['anomaly-detection', 'meta-orchestrator'];
  }
  if (triggerEvent === EVENTS.DRIFT_EVENT) {
    return ['memory-research', 'probability-calibration'];
  }
  return [];
}

function stableHash(payload: unknown): string {
  const sortedKeys = Object.keys((payload ?? {}) as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
  const text = JSON.stringify(payload, sortedKeys);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.trunc((hash << 5) - hash + (text.codePointAt(i) ?? 0));
  }
  return hash.toString(16);
}
