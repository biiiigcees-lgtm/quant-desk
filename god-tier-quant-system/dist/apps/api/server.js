import http from 'node:http';
import { EVENTS } from '../../core/event-bus/events.js';
export class ApiServer {
    constructor(bus, host, port) {
        this.bus = bus;
        this.host = host;
        this.port = port;
        this.server = null;
        this.latest = {};
        this.orchestrationMetrics = [];
        this.orchestrationFailures = [];
        this.routingDecisions = [];
    }
    start() {
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
        this.bus.on(EVENTS.BELIEF_GRAPH_STATE, (event) => {
            this.latest.beliefGraphState = event;
        });
        this.bus.on(EVENTS.SYSTEM_CONSCIOUSNESS, (event) => {
            this.latest.systemConsciousness = event;
        });
        this.bus.on(EVENTS.EPISTEMIC_HEALTH, (event) => {
            this.latest.epistemicHealth = event;
        });
        this.bus.on(EVENTS.DIGITAL_IMMUNE_ALERT, (event) => {
            this.latest.digitalImmuneAlert = event;
        });
        this.bus.on(EVENTS.STRATEGY_GENOME_UPDATE, (event) => {
            this.latest.strategyGenome = event;
        });
        this.bus.on(EVENTS.REPLAY_INTEGRITY, (event) => {
            this.latest.replayIntegrity = event;
        });
        this.bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
            this.latest.constitutionalDecision = event;
        });
        this.bus.on(EVENTS.AI_ORCHESTRATION_METRICS, (event) => {
            this.orchestrationMetrics.unshift(event);
            if (this.orchestrationMetrics.length > 100) {
                this.orchestrationMetrics.pop();
            }
            this.latest.aiOrchestrationMetrics = this.orchestrationMetrics;
        });
        this.bus.on(EVENTS.AI_AGENT_FAILURE, (event) => {
            this.orchestrationFailures.unshift(event);
            if (this.orchestrationFailures.length > 100) {
                this.orchestrationFailures.pop();
            }
            this.latest.aiOrchestrationFailures = this.orchestrationFailures;
        });
        this.bus.on(EVENTS.AI_ROUTING_DECISION, (event) => {
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
                res.end(JSON.stringify({
                    executionState: this.latest.executionState ?? null,
                    executionControl: this.latest.executionControl ?? null,
                    calibration: this.latest.calibration ?? null,
                    drift: this.latest.drift ?? null,
                    validation: this.latest.validation ?? null,
                    aiAggregatedIntelligence: this.latest.aiAggregatedIntelligence ?? null,
                    constitutionalDecision: this.latest.constitutionalDecision ?? null,
                }));
                return;
            }
            if (path === '/decision') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    constitutionalDecision: this.latest.constitutionalDecision ?? null,
                }));
                return;
            }
            if (path === '/orchestration') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    aiAggregatedIntelligence: this.latest.aiAggregatedIntelligence ?? null,
                    aiOrchestrationMetrics: this.latest.aiOrchestrationMetrics ?? [],
                    aiOrchestrationFailures: this.latest.aiOrchestrationFailures ?? [],
                    aiRoutingDecisions: this.latest.aiRoutingDecisions ?? [],
                    summary: this.computeOrchestrationSummary(),
                }));
                return;
            }
            if (path === '/orchestration/summary') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(this.computeOrchestrationSummary()));
                return;
            }
            if (path === '/organism') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    systemConsciousness: this.latest.systemConsciousness ?? null,
                    epistemicHealth: this.latest.epistemicHealth ?? null,
                    digitalImmuneAlert: this.latest.digitalImmuneAlert ?? null,
                    strategyGenome: this.latest.strategyGenome ?? null,
                    replayIntegrity: this.latest.replayIntegrity ?? null,
                }));
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
    stop() {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(() => resolve());
        });
    }
    computeOrchestrationSummary() {
        const metrics = this.orchestrationMetrics;
        const samples = metrics.length;
        const avgLatencyMs = samples === 0 ? 0 : Number((metrics.reduce((sum, row) => sum + row.latencyMs, 0) / samples).toFixed(2));
        const totalTokens = metrics.reduce((sum, row) => sum + Number(row.totalTokens ?? 0), 0);
        const estimatedCostUsd = Number(metrics.reduce((sum, row) => sum + Number(row.estimatedCostUsd ?? 0), 0).toFixed(6));
        const cacheHitRate = samples === 0
            ? 0
            : Number((metrics.filter((row) => row.cacheHit).length / samples).toFixed(4));
        const fallbackRate = samples === 0
            ? 0
            : Number((metrics.filter((row) => row.fallbackDepth > 0).length / samples).toFixed(4));
        const byAgent = {};
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
