import { EVENTS } from '../../core/event-bus/events.js';
import { createHash } from 'node:crypto';
export class ReplayEngine {
    constructor(bus) {
        this.bus = bus;
        this.tracked = [
            EVENTS.MARKET_DATA,
            EVENTS.MICROSTRUCTURE,
            EVENTS.FEATURES,
            EVENTS.PROBABILITY,
            EVENTS.CALIBRATION_UPDATE,
            EVENTS.DRIFT_EVENT,
            EVENTS.MARKET_PHYSICS,
            EVENTS.SCENARIO_BRANCH_STATE,
            EVENTS.CROSS_MARKET_CAUSAL_STATE,
            EVENTS.MARKET_WORLD_STATE,
            EVENTS.META_CALIBRATION,
            EVENTS.EPISTEMIC_MEMORY_REVISION,
            EVENTS.MARKET_EXPERIENCE,
            EVENTS.SELF_IMPROVEMENT,
            EVENTS.DECISION_SNAPSHOT,
            EVENTS.CONSTITUTIONAL_DECISION,
            EVENTS.AGGREGATED_SIGNAL,
            EVENTS.RISK_DECISION,
            EVENTS.EXECUTION_CONTROL,
            EVENTS.EXECUTION_PLAN,
            EVENTS.EXECUTION_STATE,
            EVENTS.EXECUTION_ALPHA,
            EVENTS.ORDER_EVENT,
            EVENTS.PORTFOLIO_UPDATE,
            EVENTS.RECONCILIATION,
            EVENTS.VALIDATION_RESULT,
            EVENTS.OPERATOR_ATTENTION,
        ];
    }
    start() {
        this.bus.history(this.tracked);
    }
    replay(targetBus) {
        for (const record of this.getRecords()) {
            targetBus.emit(EVENTS.REPLAY_EVENT, record);
            targetBus.emit(record.event, record.payload, {
                timestamp: record.timestamp,
                snapshotId: record.snapshotId,
                source: record.source,
                idempotencyKey: record.idempotencyKey,
            });
        }
    }
    deriveState(upToSequence) {
        const records = this.bus.history().filter((record) => upToSequence === undefined || record.sequence <= upToSequence);
        return ReplayEngine.reduceState(records);
    }
    getStateAtSequence(sequence) {
        return this.deriveState(sequence);
    }
    getRecords() {
        return this.bus.history(this.tracked).map((record) => ({
            sequence: record.sequence,
            event: record.event,
            payload: record.payload,
            sourceTimestamp: record.sourceTimestamp,
            receiveTimestamp: record.receiveTimestamp,
            timestamp: record.timestamp,
            snapshotId: record.snapshotId,
            source: record.source,
            lineageId: record.lineageId,
            idempotencyKey: record.idempotencyKey,
        }));
    }
    checksum() {
        const hash = createHash('sha256');
        for (const record of this.getRecords()) {
            hash.update(record.event);
            hash.update(':');
            hash.update(stableStringify(record.payload));
            hash.update('|');
            hash.update(record.snapshotId);
            hash.update('|');
            hash.update(record.source);
            hash.update('|');
            hash.update(record.idempotencyKey ?? '');
            hash.update('\n');
        }
        return hash.digest('hex');
    }
    static reduceState(records) {
        const state = {};
        for (const record of records) {
            const collection = STATE_COLLECTIONS[record.event];
            if (collection) {
                const current = Array.isArray(state[collection.key]) ? [...state[collection.key]] : [];
                current.unshift(record.payload);
                state[collection.key] = current.slice(0, collection.limit);
            }
            const stateKey = STATE_EVENT_KEYS[record.event];
            if (stateKey) {
                state[stateKey] = record.payload;
            }
        }
        return state;
    }
}
const STATE_EVENT_KEYS = {
    [EVENTS.PROBABILITY]: 'probability',
    [EVENTS.AGGREGATED_SIGNAL]: 'signal',
    [EVENTS.EXECUTION_CONTROL]: 'executionControl',
    [EVENTS.EXECUTION_STATE]: 'executionState',
    [EVENTS.CALIBRATION_UPDATE]: 'calibration',
    [EVENTS.DRIFT_EVENT]: 'drift',
    [EVENTS.VALIDATION_RESULT]: 'validation',
    [EVENTS.PORTFOLIO_UPDATE]: 'portfolio',
    [EVENTS.ANOMALY]: 'anomaly',
    [EVENTS.REALITY_SNAPSHOT]: 'realitySnapshot',
    [EVENTS.MARKET_DATA_INTEGRITY]: 'marketDataIntegrity',
    [EVENTS.MARKET_CAUSAL_STATE]: 'marketCausalState',
    [EVENTS.PARTICIPANT_FLOW]: 'participantFlow',
    [EVENTS.ADVERSARIAL_AUDIT]: 'adversarialAudit',
    [EVENTS.MARKET_MEMORY]: 'marketMemory',
    [EVENTS.SIMULATION_UNIVERSE]: 'simulationUniverse',
    [EVENTS.MULTI_TIMESCALE_VIEW]: 'multiTimescaleView',
    [EVENTS.MARKET_PHYSICS]: 'marketPhysics',
    [EVENTS.SCENARIO_BRANCH_STATE]: 'scenarioBranchState',
    [EVENTS.CROSS_MARKET_CAUSAL_STATE]: 'crossMarketCausalState',
    [EVENTS.MARKET_WORLD_STATE]: 'marketWorldState',
    [EVENTS.META_CALIBRATION]: 'metaCalibration',
    [EVENTS.OPERATOR_ATTENTION]: 'operatorAttention',
    [EVENTS.SELF_IMPROVEMENT]: 'selfImprovement',
    [EVENTS.MARKET_EXPERIENCE]: 'marketExperience',
    [EVENTS.EPISTEMIC_MEMORY_REVISION]: 'epistemicMemoryRevision',
    [EVENTS.AI_AGGREGATED_INTELLIGENCE]: 'aiAggregatedIntelligence',
    [EVENTS.BELIEF_GRAPH_STATE]: 'beliefGraphState',
    [EVENTS.SYSTEM_BELIEF_STATE]: 'systemBeliefState',
    [EVENTS.SYSTEM_BELIEF_UPDATE]: 'systemBeliefUpdate',
    [EVENTS.SYSTEM_BELIEF_OUTCOME]: 'systemBeliefOutcome',
    [EVENTS.SYSTEM_CONSCIOUSNESS]: 'systemConsciousness',
    [EVENTS.EPISTEMIC_HEALTH]: 'epistemicHealth',
    [EVENTS.DIGITAL_IMMUNE_ALERT]: 'digitalImmuneAlert',
    [EVENTS.STRATEGY_GENOME_UPDATE]: 'strategyGenome',
    [EVENTS.REPLAY_INTEGRITY]: 'replayIntegrity',
    [EVENTS.CONSTITUTIONAL_DECISION]: 'constitutionalDecision',
    [EVENTS.UNIFIED_FIELD]: 'unifiedField',
    [EVENTS.SHADOW_DECISION]: 'shadowDecision',
    [EVENTS.LIQUIDITY_GRAVITY]: 'liquidityGravity',
    [EVENTS.REGIME_TRANSITION]: 'regimeTransition',
    [EVENTS.FILTERED_SIGNAL]: 'filteredSignal',
    [EVENTS.REALITY_ALIGNMENT]: 'realityAlignment',
    [EVENTS.CAUSAL_WEIGHTS]: 'causalWeights',
};
const STATE_COLLECTIONS = {
    [EVENTS.CAUSAL_INSIGHT]: { key: 'causalInsights', limit: 40 },
    [EVENTS.AI_ORCHESTRATION_METRICS]: { key: 'aiOrchestrationMetrics', limit: 100 },
    [EVENTS.AI_AGENT_FAILURE]: { key: 'aiOrchestrationFailures', limit: 100 },
    [EVENTS.AI_ROUTING_DECISION]: { key: 'aiRoutingDecisions', limit: 100 },
};
function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const obj = value;
    const keys = Object.keys(obj).sort((left, right) => left.localeCompare(right));
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
    return `{${entries.join(',')}}`;
}
