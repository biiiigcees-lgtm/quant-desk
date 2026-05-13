import http from 'node:http';
import { EVENTS } from '../../core/event-bus/events.js';
import { SnapshotReducer } from '../../core/snapshot/reducer.js';
import { InvariantChecker } from '../../core/invariants/checker.js';
import { ReplayStorage } from '../../core/replay/storage.js';
import { ExecutionJournal } from '../../core/execution/journal.js';
import { ExecutionCoordinator } from '../../core/determinism/execution-coordinator.js';
export class ApiServer {
    constructor(bus, host, port, riskGovernor, lineageTracer, unifiedField) {
        this.bus = bus;
        this.host = host;
        this.port = port;
        this.riskGovernor = riskGovernor;
        this.lineageTracer = lineageTracer;
        this.unifiedField = unifiedField;
        this.server = null;
        this.latest = {};
        this.orchestrationMetrics = [];
        this.orchestrationFailures = [];
        this.routingDecisions = [];
        this.snapshotReducer = new SnapshotReducer();
        this.invariantChecker = new InvariantChecker();
        this.replayStorage = new ReplayStorage(process.env['REPLAY_LOG_PATH'] ?? '/tmp/quant-replay.log');
        const coordinator = new ExecutionCoordinator();
        this.executionJournal = new ExecutionJournal(coordinator);
        // Run invariant checks whenever the snapshot updates
        this.snapshotReducer.subscribe((snap) => {
            const violations = this.invariantChecker.check(snap);
            if (violations.length > 0) {
                for (const v of violations) {
                    this.bus.emit(EVENTS.TELEMETRY, {
                        level: v.severity === 'critical' ? 'error' : 'warn',
                        context: 'InvariantChecker',
                        invariant: v.invariant,
                        snapshotId: v.snapshotId,
                        details: v.details,
                        timestamp: v.timestamp,
                    });
                }
            }
        });
    }
    start() {
        this.bus.on(EVENTS.PROBABILITY, (event) => {
            this.latest.probability = event;
            this.snapshotReducer.apply('probability', event);
            const snap = this.snapshotReducer.getSnapshot();
            this.replayStorage.append(EVENTS.PROBABILITY, event, { snapshotId: snap.snapshotId });
        });
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, (event) => {
            this.latest.signal = event;
            this.snapshotReducer.apply('signal', event);
        });
        this.bus.on(EVENTS.EXECUTION_CONTROL, (event) => {
            this.latest.executionControl = event;
            this.snapshotReducer.apply('executionControl', event);
        });
        this.bus.on(EVENTS.EXECUTION_STATE, (event) => {
            this.latest.executionState = event;
            this.snapshotReducer.apply('executionState', event);
        });
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            this.latest.calibration = event;
            this.snapshotReducer.apply('calibration', event);
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            this.latest.drift = event;
            this.snapshotReducer.apply('drift', event);
        });
        this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
            this.latest.validation = event;
            // validation is not an ImmutableSnapshot field — no reducer call
        });
        this.bus.on(EVENTS.PORTFOLIO_UPDATE, (event) => {
            this.latest.portfolio = event;
            this.snapshotReducer.apply('portfolio', event);
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            this.latest.anomaly = event;
            this.snapshotReducer.apply('anomaly', event);
        });
        this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
            this.latest.aiAggregatedIntelligence = event;
            this.snapshotReducer.apply('aiAggregatedIntelligence', event);
        });
        this.bus.on(EVENTS.BELIEF_GRAPH_STATE, (event) => {
            this.latest.beliefGraphState = event;
            // beliefGraphState is not an ImmutableSnapshot field — no reducer call
        });
        this.bus.on(EVENTS.SYSTEM_CONSCIOUSNESS, (event) => {
            this.latest.systemConsciousness = event;
            this.snapshotReducer.apply('systemConsciousness', event);
        });
        this.bus.on(EVENTS.EPISTEMIC_HEALTH, (event) => {
            this.latest.epistemicHealth = event;
            this.snapshotReducer.apply('epistemicHealth', event);
        });
        this.bus.on(EVENTS.DIGITAL_IMMUNE_ALERT, (event) => {
            this.latest.digitalImmuneAlert = event;
            // digitalImmuneAlert is not an ImmutableSnapshot field — no reducer call
        });
        this.bus.on(EVENTS.STRATEGY_GENOME_UPDATE, (event) => {
            this.latest.strategyGenome = event;
            // strategyGenome is not an ImmutableSnapshot field — no reducer call
        });
        this.bus.on(EVENTS.REPLAY_INTEGRITY, (event) => {
            this.latest.replayIntegrity = event;
            // replayIntegrity is not an ImmutableSnapshot field — no reducer call
        });
        this.bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
            this.latest.constitutionalDecision = event;
            // constitutionalDecision is not an ImmutableSnapshot field — no reducer call
        });
        this.bus.on(EVENTS.AI_ORCHESTRATION_METRICS, (event) => {
            this.orchestrationMetrics.unshift(event);
            if (this.orchestrationMetrics.length > 100) {
                this.orchestrationMetrics.pop();
            }
            this.latest.aiOrchestrationMetrics = this.orchestrationMetrics;
            this.snapshotReducer.apply('aiOrchestrationMetrics', event);
        });
        this.bus.on(EVENTS.AI_AGENT_FAILURE, (event) => {
            this.orchestrationFailures.unshift(event);
            if (this.orchestrationFailures.length > 100) {
                this.orchestrationFailures.pop();
            }
            this.latest.aiOrchestrationFailures = this.orchestrationFailures;
            this.snapshotReducer.apply('aiOrchestrationFailures', event);
        });
        this.bus.on(EVENTS.AI_ROUTING_DECISION, (event) => {
            this.routingDecisions.unshift(event);
            if (this.routingDecisions.length > 100) {
                this.routingDecisions.pop();
            }
            this.latest.aiRoutingDecisions = this.routingDecisions;
            // aiRoutingDecisions is not an ImmutableSnapshot field — no reducer call
        });
        this.bus.on(EVENTS.REALITY_SNAPSHOT, (event) => {
            this.latest.realitySnapshot = event;
            this.snapshotReducer.apply('realitySnapshot', event);
        });
        this.bus.on(EVENTS.CAUSAL_INSIGHT, (event) => {
            this.latest.causalInsight = event;
            this.snapshotReducer.apply('causalInsights', event);
        });
        this.bus.on(EVENTS.ADVERSARIAL_AUDIT, (event) => {
            this.latest.adversarialAudit = event;
            this.snapshotReducer.apply('adversarialAudit', event);
        });
        this.bus.on(EVENTS.MARKET_MEMORY, (event) => {
            this.latest.marketMemory = event;
            this.snapshotReducer.apply('marketMemory', event);
        });
        this.bus.on(EVENTS.MULTI_TIMESCALE_VIEW, (event) => {
            this.latest.multiTimescaleView = event;
            this.snapshotReducer.apply('multiTimescaleView', event);
        });
        this.bus.on(EVENTS.UNIFIED_FIELD, (event) => {
            this.latest.unifiedField = event;
        });
        this.bus.on(EVENTS.SHADOW_DECISION, (event) => {
            this.latest.shadowDecision = event;
        });
        this.bus.on(EVENTS.LIQUIDITY_GRAVITY, (event) => {
            this.latest.liquidityGravity = event;
        });
        this.bus.on(EVENTS.REGIME_TRANSITION, (event) => {
            this.latest.regimeTransition = event;
        });
        this.bus.on(EVENTS.FILTERED_SIGNAL, (event) => {
            this.latest.filteredSignal = event;
        });
        this.bus.on(EVENTS.REALITY_ALIGNMENT, (event) => {
            this.latest.realityAlignment = event;
        });
        this.bus.on(EVENTS.CAUSAL_WEIGHTS, (event) => {
            this.latest.causalWeights = event;
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
            if (path === '/snapshot') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const snap = this.snapshotReducer.toSerializable();
                res.end(JSON.stringify(snap));
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
            if (path === '/invariants') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    violations: this.invariantChecker.getViolations().slice(-50),
                    criticalCount: this.invariantChecker.getCriticalViolations().length,
                    hasCritical: this.invariantChecker.hasCriticalViolations(),
                    summary: this.invariantChecker.violationSummary(),
                }));
                return;
            }
            if (path === '/journal') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    history: this.executionJournal.getHistory(50),
                    failures: this.executionJournal.getFailures().slice(-20),
                }));
                return;
            }
            if (path === '/replay/verify') {
                void this.replayStorage.verify().then((result) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                });
                return;
            }
            if (path === '/risk/mode') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    mode: this.riskGovernor?.getMode() ?? 'NORMAL',
                    canExecute: this.riskGovernor?.canExecute() ?? true,
                    isLocked: this.riskGovernor?.isLocked() ?? false,
                    lockedSince: this.riskGovernor?.lockedSince() ?? null,
                }));
                return;
            }
            if (path === '/lineage') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    recent: this.lineageTracer?.getRecent(50) ?? [],
                }));
                return;
            }
            if (path.startsWith('/lineage/')) {
                const contractId = decodeURIComponent(path.slice('/lineage/'.length));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    contractId,
                    chains: this.lineageTracer?.getLineage(contractId, 20) ?? [],
                }));
                return;
            }
            if (path === '/unified-field') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    field: this.latest.unifiedField ?? null,
                    shadow: this.latest.shadowDecision ?? null,
                    gravity: this.latest.liquidityGravity ?? null,
                    regime: this.latest.regimeTransition ?? null,
                    filteredSignal: this.latest.filteredSignal ?? null,
                    realityAlignment: this.latest.realityAlignment ?? null,
                    causalWeights: this.latest.causalWeights ?? null,
                }));
                return;
            }
            if (path.startsWith('/unified-field/')) {
                const contractId = decodeURIComponent(path.slice('/unified-field/'.length));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    contractId,
                    field: this.unifiedField?.getLatestField(contractId) ?? null,
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
