import { createHash } from 'node:crypto';
import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  AnomalyEvent,
  CalibrationEvent,
  CanonicalDecisionSnapshot,
  DecisionSnapshotEvent,
  DecisionSnapshotInvalidEvent,
  DriftEvent,
  ExecutionPlan,
  FeatureEvent,
  MarketDataEvent,
  MicrostructureEvent,
  ProbabilityEvent,
  SnapshotSourceKind,
  SnapshotSourceMeta,
} from '../../core/schemas/events.js';

interface SourceRecord<T> {
  value: T;
  timestamp: number;
  version: number;
}

interface ContractSnapshotState {
  sequence: number;
  sources: {
    market_data?: SourceRecord<MarketDataEvent>;
    microstructure?: SourceRecord<MicrostructureEvent>;
    features?: SourceRecord<FeatureEvent>;
    probability?: SourceRecord<ProbabilityEvent>;
    calibration?: SourceRecord<CalibrationEvent>;
    drift?: SourceRecord<DriftEvent>;
    anomaly?: SourceRecord<AnomalyEvent>;
    execution_plan?: SourceRecord<ExecutionPlan>;
  };
}

interface SnapshotSyncOptions {
  defaultContractId: string;
  maxSourceAgeMs: number;
  maxClockDriftMs: number;
}

const REQUIRED_SOURCES: SnapshotSourceKind[] = [
  'market_data',
  'microstructure',
  'features',
  'probability',
  'calibration',
  'drift',
];

export class SnapshotSyncService {
  private readonly byContract = new Map<string, ContractSnapshotState>();

  constructor(private readonly bus: EventBus, private readonly options: SnapshotSyncOptions) {}

  start(): void {
    this.bus.on<MarketDataEvent>(EVENTS.MARKET_DATA, (event) => {
      if (this.recordSource(event.contractId, 'market_data', event, event.timestamp)) {
        this.tryEmitSnapshot(event.contractId, EVENTS.MARKET_DATA, event.timestamp);
      }
    });
    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, (event) => {
      if (this.recordSource(event.contractId, 'microstructure', event, event.timestamp)) {
        this.tryEmitSnapshot(event.contractId, EVENTS.MICROSTRUCTURE, event.timestamp);
      }
    });
    this.bus.on<FeatureEvent>(EVENTS.FEATURES, (event) => {
      if (this.recordSource(event.contractId, 'features', event, event.timestamp)) {
        this.tryEmitSnapshot(event.contractId, EVENTS.FEATURES, event.timestamp);
      }
    });
    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, (event) => {
      if (this.recordSource(event.contractId, 'probability', event, event.timestamp)) {
        this.tryEmitSnapshot(event.contractId, EVENTS.PROBABILITY, event.timestamp);
      }
    });
    this.bus.on<CalibrationEvent>(EVENTS.CALIBRATION_UPDATE, (event) => {
      if (this.recordSource(event.contractId, 'calibration', event, event.timestamp)) {
        this.tryEmitSnapshot(event.contractId, EVENTS.CALIBRATION_UPDATE, event.timestamp);
      }
    });
    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, (event) => {
      if (this.recordSource(event.contractId, 'drift', event, event.timestamp)) {
        this.tryEmitSnapshot(event.contractId, EVENTS.DRIFT_EVENT, event.timestamp);
      }
    });
    this.bus.on<AnomalyEvent>(EVENTS.ANOMALY, (event) => {
      if (this.recordSource(event.contractId, 'anomaly', event, event.timestamp)) {
        this.tryEmitSnapshot(event.contractId, EVENTS.ANOMALY, event.timestamp);
      }
    });
    this.bus.on<ExecutionPlan>(EVENTS.EXECUTION_PLAN, (event) => {
      if (this.recordSource(event.contractId, 'execution_plan', event, event.timestamp)) {
        this.tryEmitSnapshot(event.contractId, EVENTS.EXECUTION_PLAN, event.timestamp);
      }
    });
  }

  private recordSource<T>(contractId: string, source: SnapshotSourceKind, value: T, timestamp: number): boolean {
    const state = this.getContractState(contractId);
    const sourceState = state.sources as Record<SnapshotSourceKind, SourceRecord<unknown> | undefined>;
    const prev = sourceState[source];
    if (prev && timestamp < prev.timestamp) {
      this.emitStaleSourceTelemetry(contractId, source, timestamp, prev.timestamp);
      return false;
    }

    sourceState[source] = {
      value: value as unknown,
      timestamp,
      version: (prev?.version ?? 0) + 1,
    };

    return true;
  }

  private tryEmitSnapshot(contractId: string, triggerEvent: string, nowTs: number): void {
    const state = this.getContractState(contractId);
    const missingSources = REQUIRED_SOURCES.filter((source) => !state.sources[source]);
    if (missingSources.length > 0) {
      this.emitInvalid(contractId, triggerEvent, nowTs, {
        reason: 'missing-source',
        missingSources,
      });
      return;
    }

    const staleSources: Array<{ source: SnapshotSourceKind; ageMs: number }> = [];
    for (const source of REQUIRED_SOURCES) {
      const record = state.sources[source];
      if (!record) continue;
      const ageMs = Math.max(0, nowTs - record.timestamp);
      if (ageMs > this.options.maxSourceAgeMs) {
        staleSources.push({ source, ageMs });
      }
    }
    if (staleSources.length > 0) {
      this.emitInvalid(contractId, triggerEvent, nowTs, {
        reason: 'stale-source',
        staleSources,
      });
      return;
    }

    const requiredTimestamps = REQUIRED_SOURCES
      .map((source) => state.sources[source]?.timestamp)
      .filter((value): value is number => Number.isFinite(value));
    const minTs = Math.min(...requiredTimestamps);
    const maxTs = Math.max(...requiredTimestamps);
    const driftMs = Math.max(0, maxTs - minTs);
    if (driftMs > this.options.maxClockDriftMs) {
      this.emitInvalid(contractId, triggerEvent, nowTs, {
        reason: 'clock-drift',
        driftMs,
      });
      return;
    }

    state.sequence += 1;

    const sourceMeta: SnapshotSourceMeta[] = this.buildSourceMeta(state, nowTs);
    const marketData = state.sources.market_data?.value;
    const microstructure = state.sources.microstructure?.value;
    const features = state.sources.features?.value;
    const probability = state.sources.probability?.value;
    const calibration = state.sources.calibration?.value;
    const drift = state.sources.drift?.value;
    if (!marketData || !microstructure || !features || !probability || !calibration || !drift) {
      return;
    }

    const snapshotState = {
      marketData,
      microstructure,
      features,
      probability,
      calibration,
      drift,
      anomaly: state.sources.anomaly?.value ?? null,
      executionPlan: state.sources.execution_plan?.value ?? null,
    };

    const marketStateHash = this.buildHash(contractId, state.sequence, sourceMeta, snapshotState);
    const snapshotId = this.buildSnapshotId(contractId, state.sequence, marketStateHash);
    const canonicalSnapshot: CanonicalDecisionSnapshot = {
      snapshotId,
      contractId,
      sequence: state.sequence,
      timestamp: nowTs,
      hash: marketStateHash,
      market: marketData,
      microstructure,
      indicators: features,
      aiContext: {
        probability,
        calibration,
        drift,
        anomaly: snapshotState.anomaly,
      },
      executionState: snapshotState.executionPlan,
      riskState: snapshotState.executionPlan
        ? {
            safetyMode: snapshotState.executionPlan.safetyMode,
            reason: snapshotState.executionPlan.routeReason,
          }
        : null,
    };
    const snapshot: DecisionSnapshotEvent = {
      snapshot_id: snapshotId,
      contractId,
      triggerEvent,
      timestamp: nowTs,
      market_state_hash: marketStateHash,
      eventSequence: state.sequence,
      sourceMeta,
      state: snapshotState,
      canonical: canonicalSnapshot,
    };

    this.bus.emit(EVENTS.DECISION_SNAPSHOT, snapshot);
  }

  private buildSourceMeta(state: ContractSnapshotState, nowTs: number): SnapshotSourceMeta[] {
    const order: SnapshotSourceKind[] = [
      'market_data',
      'microstructure',
      'features',
      'probability',
      'calibration',
      'drift',
      'anomaly',
      'execution_plan',
    ];

    return order
      .map((source) => {
        const record = state.sources[source];
        if (!record) {
          return null;
        }
        return {
          source,
          eventTimestamp: record.timestamp,
          ageMs: Math.max(0, nowTs - record.timestamp),
          version: record.version,
          required: REQUIRED_SOURCES.includes(source),
        } satisfies SnapshotSourceMeta;
      })
      .filter((value): value is SnapshotSourceMeta => value !== null);
  }

  private buildHash(
    contractId: string,
    sequence: number,
    sourceMeta: SnapshotSourceMeta[],
    state: DecisionSnapshotEvent['state'],
  ): string {
    const payload = JSON.stringify({
      contractId,
      sequence,
      sourceMeta,
      state,
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  private buildSnapshotId(contractId: string, sequence: number, marketStateHash: string): string {
    return `${contractId}:${sequence}:${marketStateHash.slice(0, 16)}`;
  }

  private emitStaleSourceTelemetry(
    contractId: string,
    source: SnapshotSourceKind,
    rejectedTimestamp: number,
    latestTimestamp: number,
  ): void {
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'snapshot.stale-event-rejected',
      value: 1,
      tags: {
        contractId,
        source,
        rejectedTimestamp: String(rejectedTimestamp),
        latestTimestamp: String(latestTimestamp),
      },
      timestamp: Date.now(),
    });
  }

  private emitInvalid(
    contractId: string,
    triggerEvent: string,
    timestamp: number,
    details: {
      reason: DecisionSnapshotInvalidEvent['reason'];
      missingSources?: SnapshotSourceKind[];
      staleSources?: Array<{ source: SnapshotSourceKind; ageMs: number }>;
      driftMs?: number;
    },
  ): void {
    this.bus.emit(EVENTS.DECISION_SNAPSHOT_INVALID, {
      contractId,
      triggerEvent,
      reason: details.reason,
      missingSources: details.missingSources,
      staleSources: details.staleSources,
      driftMs: details.driftMs,
      timestamp,
    } satisfies DecisionSnapshotInvalidEvent);
  }

  private getContractState(contractIdRaw: string): ContractSnapshotState {
    const contractId = contractIdRaw || this.options.defaultContractId;
    const current = this.byContract.get(contractId);
    if (current) {
      return current;
    }
    const next: ContractSnapshotState = {
      sequence: 0,
      sources: {},
    };
    this.byContract.set(contractId, next);
    return next;
  }
}
