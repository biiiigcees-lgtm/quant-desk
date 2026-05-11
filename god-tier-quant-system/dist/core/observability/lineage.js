import { EVENTS } from '../event-bus/events.js';
import { safeHandler } from '../errors/handler.js';
import { coerceToCanonical } from '../ai/canonical-output.js';
export class EventLineageTracer {
    constructor(bus, maxChains = 500) {
        this.bus = bus;
        this.chains = [];
        this.bySnapshotId = new Map();
        this.maxChains = Math.max(1, maxChains);
    }
    start() {
        this.bus.on(EVENTS.PROBABILITY, safeHandler((e) => {
            const seq = this.bus.history(EVENTS.PROBABILITY).length;
            const snapshotId = `lineage-${seq}-${e.contractId}-${e.timestamp.toString(36)}`;
            this.openChain(snapshotId, e.contractId, seq, e.timestamp);
        }, 'LineageTracer.probability'));
        this.bus.on(EVENTS.AI_AGENT_RESPONSE, safeHandler((e) => {
            const chain = this.latestForContract(e.contractId);
            if (!chain)
                return;
            const canonical = coerceToCanonical(e.output, e.agent);
            chain.aiAgents.push({
                agent: e.agent,
                requestId: e.requestId,
                confidence: canonical.confidence,
                recommendation: canonical.executionRecommendation,
                latencyMs: e.metrics.latencyMs,
            });
        }, 'LineageTracer.agentResponse'));
        this.bus.on(EVENTS.CONSTITUTIONAL_DECISION, safeHandler((e) => {
            const chain = this.bySnapshotId.get(e.snapshot_id) ?? this.latestForContract(e.contractId);
            if (!chain)
                return;
            chain.constitutionalDecision = {
                cycleId: e.cycle_id,
                tradeAllowed: e.trade_allowed,
                edgeScore: e.edge_score,
                riskLevel: e.risk_level,
            };
        }, 'LineageTracer.decision'));
        this.bus.on(EVENTS.EXECUTION_PLAN, safeHandler((e) => {
            const chain = this.latestForContract(e.contractId);
            if (!chain)
                return;
            chain.executionDecision = {
                executionId: e.executionId,
                direction: e.direction,
                safetyMode: e.safetyMode,
                tradeAllowed: e.safetyMode !== 'hard-stop',
            };
            chain.completedAt = e.timestamp;
            this.bus.emit(EVENTS.LINEAGE_CHAIN, { ...chain });
        }, 'LineageTracer.executionPlan'));
    }
    getLineage(contractId, limit = 20) {
        const result = [];
        for (let i = this.chains.length - 1; i >= 0 && result.length < limit; i--) {
            if (this.chains[i].contractId === contractId) {
                result.push(this.chains[i]);
            }
        }
        return result.reverse();
    }
    getChain(snapshotId) {
        return this.bySnapshotId.get(snapshotId);
    }
    getRecent(limit = 50) {
        return this.chains.slice(-Math.min(limit, this.chains.length));
    }
    pruneOlderThan(cutoffMs) {
        const cutoff = Date.now() - cutoffMs;
        let removed = 0;
        while (this.chains.length > 0 && (this.chains[0].marketTimestamp < cutoff)) {
            const chain = this.chains.shift();
            this.bySnapshotId.delete(chain.snapshotId);
            removed++;
        }
        return;
    }
    openChain(snapshotId, contractId, seq, timestamp) {
        if (this.chains.length >= this.maxChains) {
            const oldest = this.chains.shift();
            if (oldest)
                this.bySnapshotId.delete(oldest.snapshotId);
        }
        const chain = {
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
    latestForContract(contractId) {
        for (let i = this.chains.length - 1; i >= 0; i--) {
            if (this.chains[i].contractId === contractId) {
                return this.chains[i];
            }
        }
        return undefined;
    }
}
