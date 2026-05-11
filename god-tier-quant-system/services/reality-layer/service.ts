import { createHash } from 'node:crypto';
import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  AnomalyEvent,
  BeliefGraphEvent,
  CalibrationEvent,
  DriftEvent,
  ExecutionControlEvent,
  RealitySnapshot,
  SystemState,
} from '../../core/schemas/events.js';

// Per-contract canonical truth state.
interface ContractRealityState {
  calibrationFactor: number;
  driftFactor: number;
  anomalyFactor: number;
  beliefFactor: number;
  hardStop: boolean;
  lastTimestamp: number;
}

const DRIFT_FACTOR: Record<string, number> = {
  none: 1.0, low: 0.9, medium: 0.7, high: 0.4,
};

const ANOMALY_FACTOR: Record<string, number> = {
  none: 1.0, low: 0.85, medium: 0.65, high: 0.35, critical: 0.05,
};

export class RealityLayerService {
  private readonly state: Map<string, ContractRealityState> = new Map();
  private snapshotSequence = 0;

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<CalibrationEvent>(EVENTS.CALIBRATION_UPDATE, (event) => {
      const s = this.getOrCreate(event.contractId);
      s.calibrationFactor = Math.max(0, Math.min(1, 1 - event.ece * 4));
      s.lastTimestamp = event.timestamp;
      this.emit(event.contractId);
    });

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, (event) => {
      const s = this.getOrCreate(event.contractId);
      s.driftFactor = DRIFT_FACTOR[event.severity] ?? 1.0;
      s.lastTimestamp = event.timestamp;
      this.emit(event.contractId);
    });

    this.bus.on<AnomalyEvent>(EVENTS.ANOMALY, (event) => {
      const s = this.getOrCreate(event.contractId);
      s.anomalyFactor = ANOMALY_FACTOR[event.severity] ?? 1.0;
      s.lastTimestamp = event.timestamp;
      this.emit(event.contractId);
    });

    this.bus.on<BeliefGraphEvent>(EVENTS.BELIEF_GRAPH_UPDATE, (event) => {
      const s = this.getOrCreate(event.contractId);
      s.beliefFactor = event.graphConfidence;
      s.lastTimestamp = event.timestamp;
      this.emit(event.contractId);
    });

    this.bus.on<ExecutionControlEvent>(EVENTS.EXECUTION_CONTROL, (event) => {
      // Hard-stop applies globally; use the contractId as key if present, else '*'
      const id = event.contractId ?? '*';
      const s = this.getOrCreate(id);
      s.hardStop = event.mode === 'hard-stop';
      s.lastTimestamp = event.timestamp;
      this.emit(id);
    });
  }

  getLatestSnapshot(contractId: string): RealitySnapshot | undefined {
    const s = this.state.get(contractId) ?? this.state.get('*');
    if (!s) return undefined;
    return this.buildSnapshot(contractId, s);
  }

  getAllSnapshots(): RealitySnapshot[] {
    const result: RealitySnapshot[] = [];
    for (const [id, s] of this.state) {
      result.push(this.buildSnapshot(id, s));
    }
    return result;
  }

  private getOrCreate(contractId: string): ContractRealityState {
    if (!this.state.has(contractId)) {
      this.state.set(contractId, {
        calibrationFactor: 0.8,
        driftFactor: 1.0,
        anomalyFactor: 1.0,
        beliefFactor: 0.5,
        hardStop: false,
        lastTimestamp: Date.now(),
      });
    }
    return this.state.get(contractId)!;
  }

  private buildSnapshot(contractId: string, s: ContractRealityState): RealitySnapshot {
    const truthScore = Number(
      (s.calibrationFactor * s.driftFactor * s.anomalyFactor * s.beliefFactor).toFixed(4),
    );

    const systemState: SystemState =
      s.hardStop || truthScore < 0.20 ? 'halted'
      : truthScore < 0.45 ? 'degraded'
      : truthScore < 0.70 ? 'cautious'
      : 'nominal';

    const executionPermission =
      systemState !== 'halted' &&
      !(systemState === 'degraded' && s.anomalyFactor <= ANOMALY_FACTOR.high);

    const uncertaintyState =
      truthScore >= 0.70 ? 'low'
      : truthScore >= 0.45 ? 'medium'
      : truthScore >= 0.20 ? 'high'
      : 'extreme';

    const snapshotInput = `${contractId}:${truthScore}:${s.lastTimestamp}`;
    const canonicalSnapshotId = createHash('sha1').update(snapshotInput).digest('hex').slice(0, 12);

    return {
      contractId,
      systemState,
      actionableState: executionPermission && systemState !== 'degraded',
      uncertaintyState,
      executionPermission,
      canonicalSnapshotId,
      truthScore,
      calibrationFactor: Number(s.calibrationFactor.toFixed(4)),
      driftFactor: Number(s.driftFactor.toFixed(4)),
      anomalyFactor: Number(s.anomalyFactor.toFixed(4)),
      beliefFactor: Number(s.beliefFactor.toFixed(4)),
      timestamp: s.lastTimestamp,
    };
  }

  private emit(contractId: string): void {
    const s = this.state.get(contractId);
    if (!s) return;
    this.snapshotSequence += 1;
    const snapshot = this.buildSnapshot(contractId, s);
    this.bus.emit<RealitySnapshot>(EVENTS.REALITY_SNAPSHOT, snapshot);
  }
}
