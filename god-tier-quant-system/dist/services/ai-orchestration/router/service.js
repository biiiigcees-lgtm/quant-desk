import { EVENTS } from '../../../core/event-bus/events.js';
import { AGENT_SPECS } from '../agents/index.js';
export class AiAgentRouterService {
    constructor(bus, provider, options) {
        this.bus = bus;
        this.provider = provider;
        this.options = options;
        this.lastRunByAgentKey = new Map();
        this.cache = new Map();
    }
    start() {
        if (!this.options.enabled) {
            return;
        }
        this.bus.on(EVENTS.MICROSTRUCTURE, (payload) => this.routeEvent(EVENTS.MICROSTRUCTURE, payload));
        this.bus.on(EVENTS.PROBABILITY, (payload) => this.routeEvent(EVENTS.PROBABILITY, payload));
        this.bus.on(EVENTS.EXECUTION_PLAN, (payload) => this.routeEvent(EVENTS.EXECUTION_PLAN, payload));
        this.bus.on(EVENTS.ANOMALY, (payload) => this.routeEvent(EVENTS.ANOMALY, payload));
        this.bus.on(EVENTS.DRIFT_EVENT, (payload) => this.routeEvent(EVENTS.DRIFT_EVENT, payload));
    }
    async routeEvent(triggerEvent, payload) {
        const contractId = getContractId(payload, this.options.defaultContractId);
        const agents = routeAgentsForTrigger(triggerEvent);
        if (agents.length === 0) {
            return;
        }
        const dedupeKey = `${triggerEvent}:${contractId}:${Math.floor(Date.now() / 1000)}`;
        this.bus.emit(EVENTS.AI_ROUTING_DECISION, {
            triggerEvent,
            contractId,
            agents,
            dedupeKey,
            timestamp: Date.now(),
        });
        const tasks = [];
        for (const agent of agents) {
            const spec = AGENT_SPECS[agent];
            const agentKey = `${contractId}:${agent}`;
            const now = Date.now();
            const lastRun = this.lastRunByAgentKey.get(agentKey) ?? 0;
            if (now - lastRun < spec.debounceMs) {
                continue;
            }
            this.lastRunByAgentKey.set(agentKey, now);
            tasks.push(async () => {
                const requestId = `${agent}-${now}-${Math.random().toString(36).slice(2, 8)}`;
                const context = {
                    requestId,
                    contractId,
                    triggerEvent,
                    timestamp: now,
                    payload,
                };
                await this.runAgent(spec.kind, context);
            });
        }
        await this.executeBatched(tasks, this.options.scheduler.maxParallel);
    }
    async runAgent(agent, context) {
        const spec = AGENT_SPECS[agent];
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
            timestamp: context.timestamp,
        });
        const startedAt = Date.now();
        try {
            const providerResult = await this.provider.run(spec.buildSystemPrompt(), spec.buildUserPrompt(context), spec.preferredModels);
            const output = spec.parseOutput(providerResult.text);
            const latencyMs = Date.now() - startedAt;
            this.cache.set(cacheKey, {
                output,
                model: providerResult.model,
                expiresAt: Date.now() + spec.cacheTtlMs,
            });
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
        catch (error) {
            this.bus.emit(EVENTS.AI_AGENT_FAILURE, {
                requestId: context.requestId,
                agent,
                contractId: context.contractId,
                triggerEvent: context.triggerEvent,
                error: error.message,
                timestamp: Date.now(),
            });
        }
    }
    emitResult(result, context) {
        this.bus.emit(EVENTS.AI_AGENT_RESPONSE, {
            requestId: context.requestId,
            agent: result.agent,
            contractId: context.contractId,
            triggerEvent: context.triggerEvent,
            output: result.output,
            metrics: result.metrics,
            timestamp: Date.now(),
        });
        this.bus.emit(EVENTS.AI_ORCHESTRATION_METRICS, {
            agent: result.agent,
            contractId: context.contractId,
            triggerEvent: context.triggerEvent,
            ...result.metrics,
            timestamp: Date.now(),
        });
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
    const text = JSON.stringify(payload, Object.keys((payload ?? {})).sort());
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(16);
}
function getContractId(payload, fallback) {
    if (payload && typeof payload === 'object' && 'contractId' in payload) {
        const value = payload.contractId;
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return fallback;
}
