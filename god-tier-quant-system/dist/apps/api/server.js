import http from 'node:http';
import { EVENTS } from '../../core/event-bus/events.js';
import { ReplayEngine } from '../../services/replay-engine/service.js';
export class ApiServer {
    constructor(bus, host, port, unifiedField) {
        this.bus = bus;
        this.host = host;
        this.port = port;
        this.unifiedField = unifiedField;
        this.server = null;
        this.latest = {};
        this.causalInsights = [];
        this.orchestrationMetrics = [];
        this.orchestrationFailures = [];
        this.routingDecisions = [];
        this.replayEngine = new ReplayEngine(this.bus);
    }
    currentState() {
        return this.replayEngine.deriveState();
    }
    stateAtSequence(sequence) {
        return this.replayEngine.getStateAtSequence(sequence);
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
        this.bus.on(EVENTS.REALITY_SNAPSHOT, (event) => {
            this.latest.realitySnapshot = event;
        });
        this.bus.on(EVENTS.MARKET_DATA_INTEGRITY, (event) => {
            this.latest.marketDataIntegrity = event;
        });
        this.bus.on(EVENTS.CAUSAL_INSIGHT, (event) => {
            this.causalInsights.unshift(event);
            if (this.causalInsights.length > 40) {
                this.causalInsights.pop();
            }
            this.latest.causalInsights = this.causalInsights;
        });
        this.bus.on(EVENTS.MARKET_CAUSAL_STATE, (event) => {
            this.latest.marketCausalState = event;
        });
        this.bus.on(EVENTS.PARTICIPANT_FLOW, (event) => {
            this.latest.participantFlow = event;
        });
        this.bus.on(EVENTS.ADVERSARIAL_AUDIT, (event) => {
            this.latest.adversarialAudit = event;
        });
        this.bus.on(EVENTS.MARKET_MEMORY, (event) => {
            this.latest.marketMemory = event;
        });
        this.bus.on(EVENTS.SIMULATION_UNIVERSE, (event) => {
            this.latest.simulationUniverse = event;
        });
        this.bus.on(EVENTS.MULTI_TIMESCALE_VIEW, (event) => {
            this.latest.multiTimescaleView = event;
        });
        this.bus.on(EVENTS.MARKET_PHYSICS, (event) => {
            this.latest.marketPhysics = event;
        });
        this.bus.on(EVENTS.SCENARIO_BRANCH_STATE, (event) => {
            this.latest.scenarioBranchState = event;
        });
        this.bus.on(EVENTS.CROSS_MARKET_CAUSAL_STATE, (event) => {
            this.latest.crossMarketCausalState = event;
        });
        this.bus.on(EVENTS.MARKET_WORLD_STATE, (event) => {
            this.latest.marketWorldState = event;
        });
        this.bus.on(EVENTS.META_CALIBRATION, (event) => {
            this.latest.metaCalibration = event;
        });
        this.bus.on(EVENTS.OPERATOR_ATTENTION, (event) => {
            this.latest.operatorAttention = event;
        });
        this.bus.on(EVENTS.SELF_IMPROVEMENT, (event) => {
            this.latest.selfImprovement = event;
        });
        this.bus.on(EVENTS.MARKET_EXPERIENCE, (event) => {
            this.latest.marketExperience = event;
        });
        this.bus.on(EVENTS.EPISTEMIC_MEMORY_REVISION, (event) => {
            this.latest.epistemicMemoryRevision = event;
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
                res.end(JSON.stringify(this.currentState()));
                return;
            }
            if (path.startsWith('/state-at-sequence/')) {
                const rawSequence = decodeURIComponent(path.slice('/state-at-sequence/'.length));
                const sequence = Number(rawSequence);
                if (!Number.isInteger(sequence) || sequence < 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'invalid_sequence' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(this.stateAtSequence(sequence)));
                return;
            }
            if (path === '/execution') {
                const state = this.currentState();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    executionState: state.executionState ?? null,
                    executionControl: state.executionControl ?? null,
                    calibration: state.calibration ?? null,
                    drift: state.drift ?? null,
                    validation: state.validation ?? null,
                    aiAggregatedIntelligence: state.aiAggregatedIntelligence ?? null,
                    constitutionalDecision: state.constitutionalDecision ?? null,
                    marketPhysics: state.marketPhysics ?? null,
                    scenarioBranchState: state.scenarioBranchState ?? null,
                    crossMarketCausalState: state.crossMarketCausalState ?? null,
                    marketWorldState: state.marketWorldState ?? null,
                    metaCalibration: state.metaCalibration ?? null,
                    operatorAttention: state.operatorAttention ?? null,
                }));
                return;
            }
            if (path === '/decision') {
                const state = this.currentState();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    constitutionalDecision: state.constitutionalDecision ?? null,
                }));
                return;
            }
            if (path === '/orchestration') {
                const state = this.currentState();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    aiAggregatedIntelligence: state.aiAggregatedIntelligence ?? null,
                    aiOrchestrationMetrics: state.aiOrchestrationMetrics ?? [],
                    aiOrchestrationFailures: state.aiOrchestrationFailures ?? [],
                    aiRoutingDecisions: state.aiRoutingDecisions ?? [],
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
                const state = this.currentState();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    systemConsciousness: state.systemConsciousness ?? null,
                    epistemicHealth: state.epistemicHealth ?? null,
                    digitalImmuneAlert: state.digitalImmuneAlert ?? null,
                    strategyGenome: state.strategyGenome ?? null,
                    replayIntegrity: state.replayIntegrity ?? null,
                    marketCausalState: state.marketCausalState ?? null,
                    participantFlow: state.participantFlow ?? null,
                    adversarialAudit: state.adversarialAudit ?? null,
                    marketMemory: state.marketMemory ?? null,
                    multiTimescaleView: state.multiTimescaleView ?? null,
                    marketPhysics: state.marketPhysics ?? null,
                    scenarioBranchState: state.scenarioBranchState ?? null,
                    crossMarketCausalState: state.crossMarketCausalState ?? null,
                    marketWorldState: state.marketWorldState ?? null,
                    metaCalibration: state.metaCalibration ?? null,
                    operatorAttention: state.operatorAttention ?? null,
                    marketExperience: state.marketExperience ?? null,
                    selfImprovement: state.selfImprovement ?? null,
                    epistemicMemoryRevision: state.epistemicMemoryRevision ?? null,
                }));
                return;
            }
            if (path === '/unified-field') {
                const state = this.currentState();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    field: state.unifiedField ?? null,
                    shadow: state.shadowDecision ?? null,
                    gravity: state.liquidityGravity ?? null,
                    regime: state.regimeTransition ?? null,
                    filteredSignal: state.filteredSignal ?? null,
                    realityAlignment: state.realityAlignment ?? null,
                    causalWeights: state.causalWeights ?? null,
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
