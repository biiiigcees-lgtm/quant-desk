import { createHash } from 'node:crypto';
import { MonotonicLogicalClock } from '../../../core/determinism/logical-clock.js';
import { EVENTS } from '../../../core/event-bus/events.js';
import { AGENT_SPECS } from '../agents/index.js';
export class AiAgentRouterService {
    constructor(bus, provider, options, clock = new MonotonicLogicalClock()) {
        this.bus = bus;
        this.provider = provider;
        this.options = options;
        this.clock = clock;
        this.lastRunByAgentKey = new Map();
        this.cache = new Map();
        this.consecutiveFailures = new Map();
        this.breakerOpenUntil = new Map();
    }
    start() {
        if (!this.options.enabled) {
            return;
        }
        this.bus.on(EVENTS.DECISION_SNAPSHOT, (snapshot) => this.routeSnapshot(snapshot));
    }
    async routeSnapshot(snapshot) {
        const agents = routeAgentsForTrigger(snapshot.triggerEvent);
        if (agents.length === 0) {
            return;
        }
        const dedupeKey = `${snapshot.triggerEvent}:${snapshot.snapshot_id}`;
        const routeTimestamp = this.clock.observe(snapshot.timestamp);
        this.bus.emit(EVENTS.AI_ROUTING_DECISION, {
            triggerEvent: snapshot.triggerEvent,
            contractId: snapshot.contractId,
            snapshot_id: snapshot.snapshot_id,
            market_state_hash: snapshot.market_state_hash,
            agents,
            dedupeKey,
            timestamp: routeTimestamp,
        });
        const tasks = [];
        for (const agent of agents) {
            const spec = AGENT_SPECS[agent];
            const agentKey = `${snapshot.contractId}:${agent}`;
            const now = this.clock.now();
            const lastRun = this.lastRunByAgentKey.get(agentKey) ?? 0;
            if (now - lastRun < spec.debounceMs) {
                continue;
            }
            this.lastRunByAgentKey.set(agentKey, now);
            tasks.push(async () => {
                const requestId = `${agent}:${snapshot.snapshot_id}:${now}`;
                const context = {
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
    async runAgent(agent, context) {
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
                timestamp: this.clock.now(),
            });
            return;
        }
        const cacheKey = `${agent}:${context.contractId}:${context.triggerEvent}:${stableHash(context.payload)}`;
        const now = this.clock.now();
        this.pruneCache(now);
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
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
        const startedAt = this.clock.now();
        try {
            const providerResult = await this.provider.run(spec.buildSystemPrompt(), spec.buildUserPrompt(context), spec.preferredModels);
            const output = spec.parseOutput(providerResult.text);
            const latencyMs = Math.max(0, this.clock.tick() - startedAt);
            this.resetFailures(agent);
            this.cache.set(cacheKey, {
                output,
                model: providerResult.model,
                expiresAt: this.clock.now() + spec.cacheTtlMs,
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
                    timestamp: this.clock.now(),
                });
            }
            else {
                this.emitResult({
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
                }, context);
            }
        }
        catch (error) {
            this.recordFailure(agent);
            this.bus.emit(EVENTS.AI_AGENT_FAILURE, {
                requestId: context.requestId,
                agent,
                contractId: context.contractId,
                triggerEvent: context.triggerEvent,
                snapshot_id: context.snapshotId,
                market_state_hash: context.marketStateHash,
                error: error.message,
                timestamp: this.clock.now(),
            });
        }
    }
    isCircuitOpen(agent) {
        const until = this.breakerOpenUntil.get(agent) ?? 0;
        if (until <= this.clock.now()) {
            return false;
        }
        return true;
    }
    recordFailure(agent) {
        const failures = (this.consecutiveFailures.get(agent) ?? 0) + 1;
        this.consecutiveFailures.set(agent, failures);
        if (failures >= this.options.circuitBreaker.failureThreshold) {
            this.breakerOpenUntil.set(agent, this.clock.now() + this.options.circuitBreaker.cooldownMs);
            this.consecutiveFailures.set(agent, 0);
        }
    }
    resetFailures(agent) {
        this.consecutiveFailures.set(agent, 0);
    }
    emitResult(result, context) {
        this.bus.emit(EVENTS.AI_AGENT_RESPONSE, {
            requestId: context.requestId,
            agent: result.agent,
            contractId: context.contractId,
            triggerEvent: context.triggerEvent,
            snapshot_id: context.snapshotId,
            market_state_hash: context.marketStateHash,
            output: result.output,
            metrics: result.metrics,
            timestamp: this.clock.now(),
        });
        this.bus.emit(EVENTS.AI_ORCHESTRATION_METRICS, {
            agent: result.agent,
            contractId: context.contractId,
            triggerEvent: context.triggerEvent,
            snapshot_id: context.snapshotId,
            market_state_hash: context.marketStateHash,
            ...result.metrics,
            timestamp: this.clock.now(),
        });
    }
    pruneCache(now) {
        for (const [key, value] of this.cache.entries()) {
            if (value.expiresAt <= now) {
                this.cache.delete(key);
            }
        }
        const maxEntries = Math.max(100, this.options.maxCacheEntries ?? 1000);
        if (this.cache.size <= maxEntries) {
            return;
        }
        const ordered = [...this.cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
        const overflow = this.cache.size - maxEntries;
        for (let i = 0; i < overflow; i += 1) {
            const key = ordered[i]?.[0];
            if (key) {
                this.cache.delete(key);
            }
        }
    }
    async executeBatched(tasks, maxParallel) {
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
function routeAgentsForTrigger(triggerEvent) {
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
function stableHash(payload) {
    const normalize = (value) => {
        if (value === null || typeof value !== 'object') {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map((item) => normalize(item));
        }
        const normalized = {};
        for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
            normalized[key] = normalize(value[key]);
        }
        return normalized;
    };
    const text = JSON.stringify(normalize(payload));
    return createHash('sha256').update(text).digest('hex');
}
