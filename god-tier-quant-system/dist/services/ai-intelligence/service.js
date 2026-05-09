import { EVENTS } from '../../core/event-bus/events.js';
import { MemoryGraph } from './memory-graph.js';
export class AiIntelligenceService {
    constructor(bus) {
        this.bus = bus;
        this.memory = new MemoryGraph();
        this.counter = 0;
    }
    start() {
        this.bus.on(EVENTS.PROBABILITY, (event) => {
            this.memory.add({
                id: `mem-${++this.counter}`,
                type: 'regime',
                text: `Regime ${event.regime} with edge ${event.edge.toFixed(4)}`,
                timestamp: Date.now(),
                tags: [event.contractId, event.regime],
            });
            this.bus.emit(EVENTS.TELEMETRY, {
                name: 'ai.memory.regime.recorded',
                value: 1,
                tags: { contractId: event.contractId, regime: event.regime },
                timestamp: Date.now(),
            });
        });
        this.bus.on(EVENTS.ANOMALY, (event) => {
            this.memory.add({
                id: `mem-${++this.counter}`,
                type: 'anomaly',
                text: `${event.type}: ${event.details}`,
                timestamp: Date.now(),
                tags: [event.contractId, event.type],
            });
            this.bus.emit(EVENTS.AI_NARRATIVE, {
                contractId: event.contractId,
                text: `Anomaly detected (${event.type}); lowering confidence by ${event.confidenceDegradation}`,
                timestamp: Date.now(),
            });
            this.bus.emit(EVENTS.TELEMETRY, {
                name: 'ai.memory.anomaly.recorded',
                value: 1,
                tags: { contractId: event.contractId, type: event.type, severity: event.severity },
                timestamp: Date.now(),
            });
        });
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, (event) => {
            this.bus.emit(EVENTS.AI_NARRATIVE, {
                contractId: event.contractId,
                text: `Observer: regime=${event.regime}, score=${event.score.toFixed(2)}, agreement=${event.agreement.toFixed(1)}%`,
                timestamp: Date.now(),
            });
        });
    }
    recentNarratives(limit = 20) {
        return this.memory
            .recent(limit)
            .filter((node) => node.type === 'narrative' || node.type === 'anomaly' || node.type === 'regime')
            .map((node) => node.text);
    }
}
