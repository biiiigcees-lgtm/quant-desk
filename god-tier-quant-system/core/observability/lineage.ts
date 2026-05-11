import { EventBus } from '../event-bus/bus.js';
import { EVENTS } from '../event-bus/events.js';
import { safeHandler } from '../errors/handler.js';
import { coerceToCanonical } from '../ai/canonical-output.js';
import type {
  AgentResponseEvent,
  ConstitutionalDecisionEvent,
  ExecutionPlan,
  LineageChainEvent,
  ProbabilityEvent,
} from '../schemas/events.js';

export type LineageChain = LineageChainEvent;

export class EventLineageTracer {
  private readonly chains: LineageChain[] = [];
  private readonly maxChains: number;
  private readonly bySnapshotId = new Map<string, LineageChain>();

  constructor(private readonly bus: EventBus, maxChains = 500) {
    this.maxChains = Math.max(1, maxChains);
  }

  start(): void {
    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, safeHandler((e) => {
      const seq = this.bus.history(EVENTS.PROBABILITY).length;
      const snapshotId = `lineage-${seq}-${e.contractId}-${e.timestamp.toString(36)}`;
      this.openChain(snapshotId, e.contractId, seq, e.timestamp);
    }, 'LineageTracer.probability'));

    this.bus.on<AgentResponseEvent>(EVENTS.AI_AGENT_RESPONSE, safeHandler((e) => {
      const chain = this.latestForContract(e.contractId);
      if (!chain) return;
      const canonical = coerceToCanonical(e.output, e.agent);
      chain.aiAgents.push({
        agent: e.agent,
        requestId: e.requestId,
        confidence: canonical.confidence,
        recommendation: canonical.executionRecommendation,
        latencyMs: e.metrics.latencyMs,
      });
    }, 'LineageTracer.agentResponse'));

    this.bus.on<ConstitutionalDecisionEvent>(EVENTS.CONSTITUTIONAL_DECISION, safeHandler((e) => {
      const chain = this.bySnapshotId.get(e.snapshot_id) ?? this.latestForContract(e.contractId);
      if (!chain) return;
      chain.constitutionalDecision = {
        cycleId: e.cycle_id,
        tradeAllowed: e.trade_allowed,
        edgeScore: e.edge_score,
        riskLevel: e.risk_level,
      };
    }, 'LineageTracer.decision'));

    this.bus.on<ExecutionPlan>(EVENTS.EXECUTION_PLAN, safeHandler((e) => {
      const chain = this.latestForContract(e.contractId);
      if (!chain) return;
      chain.executionDecision = {
        executionId: e.executionId,
        direction: e.direction,
        safetyMode: e.safetyMode,
        tradeAllowed: e.safetyMode !== 'hard-stop',
      };
      chain.completedAt = e.timestamp;
      this.bus.emit<LineageChainEvent>(EVENTS.LINEAGE_CHAIN, { ...chain });
    }, 'LineageTracer.executionPlan'));
  }

  getLineage(contractId: string, limit = 20): LineageChain[] {
    const result: LineageChain[] = [];
    for (let i = this.chains.length - 1; i >= 0 && result.length < limit; i--) {
      if (this.chains[i]!.contractId === contractId) {
        result.push(this.chains[i]!);
      }
    }
    return result.reverse();
  }

  getChain(snapshotId: string): LineageChain | undefined {
    return this.bySnapshotId.get(snapshotId);
  }

  getRecent(limit = 50): LineageChain[] {
    return this.chains.slice(-Math.min(limit, this.chains.length));
  }

  pruneOlderThan(cutoffMs: number): void {
    const cutoff = Date.now() - cutoffMs;
    let removed = 0;
    while (this.chains.length > 0 && (this.chains[0]!.marketTimestamp < cutoff)) {
      const chain = this.chains.shift()!;
      this.bySnapshotId.delete(chain.snapshotId);
      removed++;
    }
    return;
  }

  private openChain(snapshotId: string, contractId: string, seq: number, timestamp: number): void {
    if (this.chains.length >= this.maxChains) {
      const oldest = this.chains.shift();
      if (oldest) this.bySnapshotId.delete(oldest.snapshotId);
    }
    const chain: LineageChain = {
      snapshotId,
      contractId,
      marketEventSeq: seq,
      marketTimestamp: timestamp,
      aiAgents: [],
      timestamp,
    };
    this.chains.push(chain);
    this.bySnapshotId.set(snapshotId, chain);
  }

  private latestForContract(contractId: string): LineageChain | undefined {
    for (let i = this.chains.length - 1; i >= 0; i--) {
      if (this.chains[i]!.contractId === contractId) {
        return this.chains[i];
      }
    }
    return undefined;
  }
}
