import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  AiMemoryWriteEvent,
  BeliefGraphStateEvent,
  DriftEvent,
  EpistemicMemoryRevisionEvent,
  SystemBeliefStateEvent,
} from '../../core/schemas/events.js';

export class AiMemoryService {
  private readonly memory = new Map<string, { value: string; timestamp: number }>();
  private readonly lastHypothesisConfidence = new Map<string, number>();
  private readonly maxEntries: number;

  constructor(private readonly bus: EventBus, maxEntries: number = 1_000) {
    this.maxEntries = Math.max(100, maxEntries);
  }

  start(): void {
    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, (event) => {
      const key = `${event.contractId}:drift`;
      const value = `psi=${event.psi.toFixed(4)},kl=${event.kl.toFixed(4)},severity=${event.severity}`;
      this.memory.set(key, { value, timestamp: event.timestamp });
      this.prune(event.timestamp);

      let confidence: number;
      if (event.severity === 'high') {
        confidence = 0.92;
      } else if (event.severity === 'medium') {
        confidence = 0.72;
      } else {
        confidence = 0.55;
      }

      const payload: AiMemoryWriteEvent = {
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

    this.bus.on<BeliefGraphStateEvent>(EVENTS.BELIEF_GRAPH_STATE, (event) => {
      const top = event.summary.topHypotheses.slice(0, 4);
      for (const hypothesis of top) {
        this.writeHypothesisRevision({
          contractId: event.contractId,
          snapshotId: event.snapshot_id,
          cycleId: event.cycle_id,
          hypothesisId: hypothesis.nodeId,
          nextConfidence: Number((1 - hypothesis.uncertainty).toFixed(4)),
          contradictionCount: event.summary.contradictionCount,
          timestamp: event.timestamp,
          confidence: Number((1 - hypothesis.uncertainty).toFixed(4)),
        });
      }
    });

    this.bus.on<SystemBeliefStateEvent>(EVENTS.SYSTEM_BELIEF_STATE, (event) => {
      const belief = event.belief;
      const hypotheses = [
        {
          id: `regime:${belief.regimeHypothesis.type}`,
          confidence: belief.regimeHypothesis.probability,
          uncertainty: 1 - belief.regimeHypothesis.stability,
        },
        {
          id: `bias:${belief.directionalBiasModel.bias}`,
          confidence: belief.directionalBiasModel.strength,
          uncertainty: 1 - belief.directionalBiasModel.persistence,
        },
        {
          id: `self:reliability`,
          confidence: belief.selfAssessment.reliabilityScore,
          uncertainty: belief.selfAssessment.calibrationDrift,
        },
      ];

      const contradictionCount = belief.structuralMarketState.manipulationRisk > 0.65 ? 1 : 0;
      for (const hypothesis of hypotheses) {
        this.writeHypothesisRevision({
          contractId: event.contractId,
          snapshotId: event.snapshot_id,
          cycleId: event.cycle_id,
          hypothesisId: hypothesis.id,
          nextConfidence: hypothesis.confidence,
          contradictionCount,
          timestamp: event.timestamp,
          confidence: Number((1 - hypothesis.uncertainty).toFixed(4)),
        });
      }
    });
  }

  private writeHypothesisRevision(params: {
    contractId: string;
    snapshotId: string;
    cycleId: string;
    hypothesisId: string;
    nextConfidence: number;
    contradictionCount: number;
    timestamp: number;
    confidence: number;
  }): void {
    const { contractId, snapshotId, cycleId, hypothesisId, nextConfidence, contradictionCount, timestamp, confidence } = params;
    const key = `${contractId}:hypothesis:${hypothesisId}`;
    const previousConfidence = this.lastHypothesisConfidence.get(key) ?? nextConfidence;

    if (Math.abs(nextConfidence - previousConfidence) < 0.03) {
      return;
    }

    this.lastHypothesisConfidence.set(key, nextConfidence);
    const revisionId = `${contractId}:${hypothesisId}:${timestamp}`;
    const reason = `confidence-shift:${previousConfidence.toFixed(3)}->${nextConfidence.toFixed(3)}`;

    const revision: EpistemicMemoryRevisionEvent = {
      contractId,
      revisionId,
      hypothesisId,
      previousConfidence: Number(previousConfidence.toFixed(4)),
      nextConfidence: Number(nextConfidence.toFixed(4)),
      reason,
      lineage: [snapshotId, cycleId, hypothesisId],
      contradictionCount,
      timestamp,
    };

    const value = `${hypothesisId}|${reason}|contradictions=${contradictionCount}`;
    this.memory.set(key, { value, timestamp });
    this.prune(timestamp);

    this.bus.emit<EpistemicMemoryRevisionEvent>(EVENTS.EPISTEMIC_MEMORY_REVISION, revision);
    this.bus.emit<AiMemoryWriteEvent>(EVENTS.AI_MEMORY_WRITE, {
      key,
      value,
      confidence,
      timestamp,
    });
  }

  private prune(now: number): void {
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
