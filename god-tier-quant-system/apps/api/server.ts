import http from 'node:http';
import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';

export class ApiServer {
  private server: http.Server | null = null;
  private readonly latest: Record<string, unknown> = {};
  private readonly orchestrationMetrics: Array<{
    agent: string;
    latencyMs: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
    fallbackDepth: number;
    cacheHit: boolean;
    timestamp: number;
  }> = [];
  private readonly orchestrationFailures: Array<{ agent: string; error: string; timestamp: number }> = [];
  private readonly routingDecisions: Array<{ triggerEvent: string; agents: string[]; timestamp: number }> = [];
  private readonly causalInsights: Array<unknown> = [];

  constructor(private readonly bus: EventBus, private readonly host: string, private readonly port: number) {}

  start(): Promise<void> {
    this.bus.on(EVENTS.PROBABILITY, (event) => {
      this.latest.probability = event;
    });
    this.bus.on(EVENTS.AGGREGATED_SIGNAL, (event) => {
      this.latest.signal = event;
    });
    this.bus.on(EVENTS.EXECUTION_CONTROL, (event) => {
      this.latest.executionControl = event;
    });
    this.bus.on(EVENTS.EXECUTION_STATE, (event) => {
      this.latest.executionState = event;
    });
    this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
      this.latest.calibration = event;
    });
    this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
      this.latest.drift = event;
    });
    this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
      this.latest.validation = event;
    });
    this.bus.on(EVENTS.PORTFOLIO_UPDATE, (event) => {
      this.latest.portfolio = event;
    });
    this.bus.on(EVENTS.ANOMALY, (event) => {
      this.latest.anomaly = event;
    });
    this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
      this.latest.aiAggregatedIntelligence = event;
    });
    this.bus.on(EVENTS.REALITY_SNAPSHOT, (event) => {
      this.latest.realitySnapshot = event;
    });
    this.bus.on(EVENTS.CAUSAL_INSIGHT, (event) => {
      this.causalInsights.unshift(event);
      if (this.causalInsights.length > 20) this.causalInsights.pop();
      this.latest.causalInsights = this.causalInsights.slice(0, 5);
    });
    this.bus.on(EVENTS.PARTICIPANT_FLOW, (event) => {
      this.latest.participantFlow = event;
    });
    this.bus.on(EVENTS.SYSTEM_CONSCIOUSNESS, (event) => {
      this.latest.systemConsciousness = event;
    });
    this.bus.on(EVENTS.EPISTEMIC_HEALTH, (event) => {
      this.latest.epistemicHealth = event;
    });
    this.bus.on(EVENTS.ADVERSARIAL_AUDIT, (event) => {
      this.latest.adversarialAudit = event;
    });
    this.bus.on(EVENTS.MARKET_MEMORY, (event) => {
      this.latest.marketMemory = event;
    });
    this.bus.on(EVENTS.MULTI_TIMESCALE_VIEW, (event) => {
      this.latest.multiTimescaleView = event;
    });
    this.bus.on(
      EVENTS.AI_ORCHESTRATION_METRICS,
      (event: {
        agent: string;
        latencyMs: number;
        totalTokens?: number;
        estimatedCostUsd?: number;
        fallbackDepth: number;
        cacheHit: boolean;
        timestamp: number;
      }) => {
      this.orchestrationMetrics.unshift(event);
      if (this.orchestrationMetrics.length > 100) {
        this.orchestrationMetrics.pop();
      }
      this.latest.aiOrchestrationMetrics = this.orchestrationMetrics;
      },
    );
    this.bus.on(EVENTS.AI_AGENT_FAILURE, (event: { agent: string; error: string; timestamp: number }) => {
      this.orchestrationFailures.unshift(event);
      if (this.orchestrationFailures.length > 100) {
        this.orchestrationFailures.pop();
      }
      this.latest.aiOrchestrationFailures = this.orchestrationFailures;
    });
    this.bus.on(EVENTS.AI_ROUTING_DECISION, (event: { triggerEvent: string; agents: string[]; timestamp: number }) => {
      this.routingDecisions.unshift(event);
      if (this.routingDecisions.length > 100) {
        this.routingDecisions.pop();
      }
      this.latest.aiRoutingDecisions = this.routingDecisions;
    });

    this.server = http.createServer((req, res) => {
      const path = req.url ?? '/';
      if (path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ts: Date.now() }));
        return;
      }

      if (path === '/state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.latest));
        return;
      }

      if (path === '/execution') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            executionState: this.latest.executionState ?? null,
            executionControl: this.latest.executionControl ?? null,
            calibration: this.latest.calibration ?? null,
            drift: this.latest.drift ?? null,
            validation: this.latest.validation ?? null,
            aiAggregatedIntelligence: this.latest.aiAggregatedIntelligence ?? null,
          }),
        );
        return;
      }

      if (path === '/orchestration') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            aiAggregatedIntelligence: this.latest.aiAggregatedIntelligence ?? null,
            aiOrchestrationMetrics: this.latest.aiOrchestrationMetrics ?? [],
            aiOrchestrationFailures: this.latest.aiOrchestrationFailures ?? [],
            aiRoutingDecisions: this.latest.aiRoutingDecisions ?? [],
            summary: this.computeOrchestrationSummary(),
          }),
        );
        return;
      }

      if (path === '/orchestration/summary') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.computeOrchestrationSummary()));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });

    return new Promise((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.port, this.host, () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  private computeOrchestrationSummary(): {
    samples: number;
    avgLatencyMs: number;
    totalTokens: number;
    estimatedCostUsd: number;
    cacheHitRate: number;
    fallbackRate: number;
    failures: number;
    byAgent: Record<string, { samples: number; avgLatencyMs: number; totalTokens: number; failures: number }>;
  } {
    const metrics = this.orchestrationMetrics;
    const samples = metrics.length;
    const avgLatencyMs =
      samples === 0 ? 0 : Number((metrics.reduce((sum, row) => sum + row.latencyMs, 0) / samples).toFixed(2));
    const totalTokens = metrics.reduce((sum, row) => sum + Number(row.totalTokens ?? 0), 0);
    const estimatedCostUsd = Number(
      metrics.reduce((sum, row) => sum + Number(row.estimatedCostUsd ?? 0), 0).toFixed(6),
    );
    const cacheHitRate =
      samples === 0
        ? 0
        : Number((metrics.filter((row) => row.cacheHit).length / samples).toFixed(4));
    const fallbackRate =
      samples === 0
        ? 0
        : Number((metrics.filter((row) => row.fallbackDepth > 0).length / samples).toFixed(4));

    const byAgent: Record<string, { samples: number; avgLatencyMs: number; totalTokens: number; failures: number }> = {};
    for (const row of metrics) {
      const bucket = byAgent[row.agent] ?? { samples: 0, avgLatencyMs: 0, totalTokens: 0, failures: 0 };
      bucket.samples += 1;
      bucket.avgLatencyMs += row.latencyMs;
      bucket.totalTokens += Number(row.totalTokens ?? 0);
      byAgent[row.agent] = bucket;
    }
    for (const [agent, bucket] of Object.entries(byAgent)) {
      bucket.avgLatencyMs = Number((bucket.avgLatencyMs / Math.max(1, bucket.samples)).toFixed(2));
      bucket.failures = this.orchestrationFailures.filter((failure) => failure.agent === agent).length;
    }

    return {
      samples,
      avgLatencyMs,
      totalTokens,
      estimatedCostUsd,
      cacheHitRate,
      fallbackRate,
      failures: this.orchestrationFailures.length,
      byAgent,
    };
  }
}
