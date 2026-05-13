import { EVENTS } from '../../core/event-bus/events.js';
export class AiMemoryService {
    constructor(bus, maxEntries = 1000) {
        this.bus = bus;
        this.memory = new Map();
        this.lastHypothesisConfidence = new Map();
        this.maxEntries = Math.max(100, maxEntries);
    }
    start() {
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const key = `${event.contractId}:drift`;
            const value = `psi=${event.psi.toFixed(4)},kl=${event.kl.toFixed(4)},severity=${event.severity}`;
            this.memory.set(key, { value, timestamp: event.timestamp });
            this.prune(event.timestamp);
            let confidence;
            if (event.severity === 'high') {
                confidence = 0.92;
            }
            else if (event.severity === 'medium') {
                confidence = 0.72;
            }
            else {
                confidence = 0.55;
            }
            const payload = {
                key,
                value,
                confidence,
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.AI_MEMORY_WRITE, payload);
            this.bus.emit(EVENTS.TELEMETRY, {
                name: 'ai.memory.writes',
                value: 1,
                tags: { severity: event.severity, size: String(this.memory.size) },
                timestamp: event.timestamp,
            });
        });
        this.bus.on(EVENTS.BELIEF_GRAPH_STATE, (event) => {
            const top = event.summary.topHypotheses.slice(0, 4);
            for (const hypothesis of top) {
                const key = `${event.contractId}:hypothesis:${hypothesis.nodeId}`;
                const previousConfidence = this.lastHypothesisConfidence.get(key) ?? hypothesis.evidence;
                const nextConfidence = hypothesis.evidence;
                if (Math.abs(nextConfidence - previousConfidence) < 0.03) {
                    continue;
                }
                this.lastHypothesisConfidence.set(key, nextConfidence);
                const revisionId = `${event.contractId}:${hypothesis.nodeId}:${event.timestamp}`;
                const reason = `confidence-shift:${previousConfidence.toFixed(3)}->${nextConfidence.toFixed(3)}`;
                const revision = {
                    contractId: event.contractId,
                    revisionId,
                    hypothesisId: hypothesis.nodeId,
                    previousConfidence: Number(previousConfidence.toFixed(4)),
                    nextConfidence: Number(nextConfidence.toFixed(4)),
                    reason,
                    lineage: [event.snapshot_id, event.cycle_id, hypothesis.nodeId],
                    contradictionCount: event.summary.contradictionCount,
                    timestamp: event.timestamp,
                };
                const value = `${hypothesis.nodeId}|${reason}|contradictions=${event.summary.contradictionCount}`;
                this.memory.set(key, { value, timestamp: event.timestamp });
                this.prune(event.timestamp);
                this.bus.emit(EVENTS.EPISTEMIC_MEMORY_REVISION, revision);
                this.bus.emit(EVENTS.AI_MEMORY_WRITE, {
                    key,
                    value,
                    confidence: Number((1 - hypothesis.uncertainty).toFixed(4)),
                    timestamp: event.timestamp,
                });
            }
        });
    }
    prune(now) {
        if (this.memory.size <= this.maxEntries) {
            return;
        }
        const entries = [...this.memory.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
        const overflow = this.memory.size - this.maxEntries;
        for (let i = 0; i < overflow; i += 1) {
            const key = entries[i]?.[0];
            if (key) {
                this.memory.delete(key);
            }
        }
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'ai.memory.pruned',
            value: overflow,
            tags: { size: String(this.memory.size) },
            timestamp: now,
        });
    }
}
