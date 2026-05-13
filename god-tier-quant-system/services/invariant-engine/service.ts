import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  ConstitutionalDecisionEvent,
  DecisionSnapshotEvent,
  ExecutionPlan,
  MetaCalibrationEvent,
  ReplayIntegrityEvent,
  SystemConsciousnessEvent,
} from '../../core/schemas/events.js';

interface SnapshotInvariantState {
  latestSequence: number;
}

export class InvariantEngineService {
  private readonly snapshotStateByContract = new Map<string, SnapshotInvariantState>();
  private readonly snapshotHashById = new Map<string, string>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<DecisionSnapshotEvent>(EVENTS.DECISION_SNAPSHOT, (event) => {
      this.validateSnapshotSequence(event);
      this.validateSnapshotImmutability(event);
    });

    this.bus.on<ConstitutionalDecisionEvent>(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
      if (!this.snapshotHashById.has(event.snapshot_id)) {
        this.raiseViolation('critical', 'decision-without-snapshot', event.timestamp, {
          contractId: event.contractId,
          snapshotId: event.snapshot_id,
          cycleId: event.cycle_id,
        });
      }
    });

    this.bus.on<ExecutionPlan>(EVENTS.EXECUTION_PLAN, (event) => {
      if (!Number.isFinite(event.timestamp) || event.timestamp <= 0) {
        this.raiseViolation('critical', 'invalid-execution-timestamp', 1, {
          executionId: event.executionId,
          contractId: event.contractId,
        });
      }
    });

    this.bus.on<MetaCalibrationEvent>(EVENTS.META_CALIBRATION, (event) => {
      if (event.authorityDecay > 0.9) {
        this.raiseViolation('critical', 'authority-decay-threshold-breach', event.timestamp, {
          contractId: event.contractId,
          authorityDecay: event.authorityDecay.toFixed(4),
        });
      } else if (event.authorityDecay > 0.75) {
        this.raiseViolation('warning', 'authority-decay-warning', event.timestamp, {
          contractId: event.contractId,
          authorityDecay: event.authorityDecay.toFixed(4),
        });
      }
    });

    this.bus.on<SystemConsciousnessEvent>(EVENTS.SYSTEM_CONSCIOUSNESS, (event) => {
      if ((event.selfTrustScore ?? 1) < 0.25 || (event.trustDecay ?? 0) > 0.85) {
        this.raiseViolation('critical', 'self-trust-collapse', event.timestamp, {
          contractId: event.contractId,
          selfTrustScore: String(event.selfTrustScore ?? 1),
          trustDecay: String(event.trustDecay ?? 0),
        });
      } else if ((event.selfTrustScore ?? 1) < 0.4 || (event.trustDecay ?? 0) > 0.65) {
        this.raiseViolation('warning', 'self-trust-degraded', event.timestamp, {
          contractId: event.contractId,
          selfTrustScore: String(event.selfTrustScore ?? 1),
          trustDecay: String(event.trustDecay ?? 0),
        });
      }
    });

    this.bus.on<ReplayIntegrityEvent>(EVENTS.REPLAY_INTEGRITY, (event) => {
      if (!event.deterministic || event.sourceChecksum !== event.replayChecksum) {
        this.raiseViolation('critical', 'replay-integrity-divergence', event.timestamp, {
          sourceChecksum: event.sourceChecksum,
          replayChecksum: event.replayChecksum,
        });
      }
    });
  }

  private validateSnapshotSequence(event: DecisionSnapshotEvent): void {
    const state = this.snapshotStateByContract.get(event.contractId) ?? { latestSequence: 0 };
    if (event.eventSequence <= state.latestSequence) {
      this.raiseViolation('critical', 'snapshot-sequence-regression', event.timestamp, {
        contractId: event.contractId,
        latestSequence: String(state.latestSequence),
        observedSequence: String(event.eventSequence),
        snapshotId: event.snapshot_id,
      });
      return;
    }

    state.latestSequence = event.eventSequence;
    this.snapshotStateByContract.set(event.contractId, state);
  }

  private validateSnapshotImmutability(event: DecisionSnapshotEvent): void {
    const existingHash = this.snapshotHashById.get(event.snapshot_id);
    if (existingHash && existingHash !== event.market_state_hash) {
      this.raiseViolation('critical', 'snapshot-hash-mutation', event.timestamp, {
        contractId: event.contractId,
        snapshotId: event.snapshot_id,
        previousHash: existingHash,
        observedHash: event.market_state_hash,
      });
      return;
    }

    if (!existingHash) {
      this.snapshotHashById.set(event.snapshot_id, event.market_state_hash);
    }
  }

  private raiseViolation(
    severity: 'warning' | 'critical',
    type: string,
    timestamp: number,
    tags: Record<string, string>,
  ): void {
    const logicalTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 1;
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'invariant.violation',
      value: severity === 'critical' ? 1 : 0,
      tags: {
        type,
        severity,
        ...tags,
      },
      timestamp: logicalTimestamp,
    }, {
      snapshotId: tags.snapshotId ?? 'na',
      source: 'invariant-engine',
      idempotencyKey: `invariant:${type}:${logicalTimestamp}:${tags.contractId ?? 'SYSTEM'}`,
      timestamp: logicalTimestamp,
    });

    if (severity === 'critical') {
      this.bus.emit(EVENTS.EXECUTION_CONTROL, {
        contractId: tags.contractId,
        mode: 'hard-stop',
        reason: `invariant-${type}`,
        timestamp: logicalTimestamp,
      }, {
        snapshotId: tags.snapshotId ?? 'na',
        source: 'invariant-engine',
        idempotencyKey: `invariant-hard-stop:${type}:${logicalTimestamp}:${tags.contractId ?? 'SYSTEM'}`,
        timestamp: logicalTimestamp,
      });
    }
  }
}
