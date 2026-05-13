import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { createHash } from 'node:crypto';

export interface ReplayRecord {
  sequence: number;
  event: string;
  payload: unknown;
  sourceTimestamp: number;
  receiveTimestamp: number;
  timestamp: number;
  snapshotId: string;
  source: string;
  lineageId: string;
  idempotencyKey?: string;
}

export interface ReplayDerivedState {
  probability?: unknown;
  signal?: unknown;
  executionControl?: unknown;
  executionState?: unknown;
  calibration?: unknown;
  drift?: unknown;
  validation?: unknown;
  portfolio?: unknown;
  anomaly?: unknown;
  realitySnapshot?: unknown;
  marketDataIntegrity?: unknown;
  causalInsights?: unknown[];
  marketCausalState?: unknown;
  participantFlow?: unknown;
  adversarialAudit?: unknown;
  marketMemory?: unknown;
  simulationUniverse?: unknown;
  multiTimescaleView?: unknown;
  marketPhysics?: unknown;
  scenarioBranchState?: unknown;
  crossMarketCausalState?: unknown;
  marketWorldState?: unknown;
  metaCalibration?: unknown;
  operatorAttention?: unknown;
  selfImprovement?: unknown;
  marketExperience?: unknown;
  epistemicMemoryRevision?: unknown;
  aiAggregatedIntelligence?: unknown;
  beliefGraphState?: unknown;
  systemBeliefState?: unknown;
  systemBeliefUpdate?: unknown;
  systemBeliefOutcome?: unknown;
  systemConsciousness?: unknown;
  epistemicHealth?: unknown;
  digitalImmuneAlert?: unknown;
  strategyGenome?: unknown;
  replayIntegrity?: unknown;
  constitutionalDecision?: unknown;
  aiOrchestrationMetrics?: unknown[];
  aiOrchestrationFailures?: unknown[];
  aiRoutingDecisions?: unknown[];
  unifiedField?: unknown;
  shadowDecision?: unknown;
  liquidityGravity?: unknown;
  regimeTransition?: unknown;
  filteredSignal?: unknown;
  realityAlignment?: unknown;
  causalWeights?: unknown;
}

interface StateCollectionSpec {
  key: keyof ReplayDerivedState;
  limit: number;
}

export class ReplayEngine {
  private readonly tracked = [
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

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.history(this.tracked);
  }

  replay(targetBus: EventBus): void {
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

  deriveState(upToSequence?: number): ReplayDerivedState {
    const records = this.bus.history().filter((record) => upToSequence === undefined || record.sequence <= upToSequence);
    return ReplayEngine.reduceState(records);
  }

  getStateAtSequence(sequence: number): ReplayDerivedState {
    return this.deriveState(sequence);
  }

  getRecords(): ReplayRecord[] {
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

  checksum(): string {
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

  static reduceState(records: ReadonlyArray<Pick<ReplayRecord, 'sequence' | 'event' | 'payload'>>): ReplayDerivedState {
    const state: ReplayDerivedState = {};

    for (const record of records) {
      const collection = STATE_COLLECTIONS[record.event];
      if (collection) {
        const current = Array.isArray(state[collection.key]) ? [...(state[collection.key] as unknown[])] : [];
        current.unshift(record.payload);
        state[collection.key] = current.slice(0, collection.limit);
      }

      const stateKey = STATE_EVENT_KEYS[record.event];
      if (stateKey) {
        (state as Record<string, unknown>)[stateKey] = record.payload;
      }
    }

    return state;
  }
}

const STATE_EVENT_KEYS: Partial<Record<string, keyof ReplayDerivedState>> = {
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

const STATE_COLLECTIONS: Partial<Record<string, StateCollectionSpec>> = {
  [EVENTS.CAUSAL_INSIGHT]: { key: 'causalInsights', limit: 40 },
  [EVENTS.AI_ORCHESTRATION_METRICS]: { key: 'aiOrchestrationMetrics', limit: 100 },
  [EVENTS.AI_AGENT_FAILURE]: { key: 'aiOrchestrationFailures', limit: 100 },
  [EVENTS.AI_ROUTING_DECISION]: { key: 'aiRoutingDecisions', limit: 100 },
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((left, right) => left.localeCompare(right));
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(',')}}`;
}
