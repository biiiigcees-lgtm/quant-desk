import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  BeliefGraphStateEvent,
  CalibrationEvent,
  ConstitutionalDecisionEvent,
  DriftEvent,
  EpistemicHealthEvent,
  SystemConsciousnessEvent,
} from '../../core/schemas/events.js';

interface ConsciousnessOptions {
  epistemicFloor: number;
}

export class SystemConsciousnessService {
  private latestBelief: BeliefGraphStateEvent | null = null;
  private latestDecision: ConstitutionalDecisionEvent | null = null;
  private latestCalibration: CalibrationEvent | null = null;
  private latestDrift: DriftEvent | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly options: ConsciousnessOptions = { epistemicFloor: 0.35 },
  ) {}

  start(): void {
    this.bus.on<BeliefGraphStateEvent>(EVENTS.BELIEF_GRAPH_STATE, (event) => {
      this.latestBelief = event;
      this.publish();
    });

    this.bus.on<ConstitutionalDecisionEvent>(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
      this.latestDecision = event;
      this.publish();
    });

    this.bus.on<CalibrationEvent>(EVENTS.CALIBRATION_UPDATE, (event) => {
      this.latestCalibration = event;
      this.publish();
    });

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, (event) => {
      this.latestDrift = event;
      this.publish();
    });
  }

  private publish(): void {
    if (!this.latestBelief || !this.latestDecision) {
      return;
    }

    const top = this.latestBelief.summary.topHypotheses.slice(0, 3).map((item) => ({
      nodeId: item.nodeId,
      evidence: item.evidence,
      uncertainty: item.uncertainty,
    }));
    const contradictionDensity = clamp(
      this.latestBelief.summary.contradictionCount / Math.max(1, this.latestBelief.summary.topHypotheses.length),
      0,
      1,
    );
    const uncertaintyTopology = clamp(this.latestBelief.summary.graphEntropy, 0, 1);
    const driftStress = this.latestDrift ? clamp(Math.max(this.latestDrift.psi, this.latestDrift.kl), 0, 1) : 0;
    const calibrationStress = this.latestCalibration ? clamp(this.latestCalibration.ece, 0, 1) : 0;
    const contradictionStress = clamp(
      this.latestBelief.summary.maxContradictionStrength,
      0,
      1,
    );
    const aggregateStress = clamp(
      0.35 * contradictionStress + 0.35 * calibrationStress + 0.3 * driftStress,
      0,
      1,
    );

    const executionConfidence = clamp(
      this.latestDecision.confidence_score * (1 - uncertaintyTopology) * (1 - aggregateStress * 0.5),
      0,
      1,
    );

    const invalidationPath = buildInvalidationPath({
      stress: aggregateStress,
      contradictionDensity,
      tradeAllowed: this.latestDecision.trade_allowed,
      epistemicFloor: this.options.epistemicFloor,
    });

    const contradictions = this.latestBelief.summary.contradictions.map((item) => ({
      source: item.hypothesis1,
      target: item.hypothesis2,
      severity: contradictionSeverity(item.conflictStrength),
      detail: item.conflictReason,
    }));

    const cognitiveStressState = cognitiveStressFromAggregate(aggregateStress);

    const consciousness: SystemConsciousnessEvent = {
      contractId: this.latestDecision.contractId,
      cycleId: this.latestDecision.cycle_id,
      snapshotId: this.latestDecision.snapshot_id,
      beliefTopology: {
        topHypotheses: top,
        contradictionCount: this.latestBelief.summary.contradictionCount,
        contradictionDensity,
        uncertaintyTopology,
      },
      epistemicStress: {
        driftStress,
        calibrationStress,
        contradictionStress,
        aggregate: aggregateStress,
      },
      executionConfidence,
      contradictions,
      contradictionDensity,
      cognitiveStressState,
      invalidationPath,
      timestamp: Date.now(),
    };

    const status = healthStatusFromAggregate(aggregateStress);
    const score = clamp(1 - aggregateStress, 0, 1);

    const health: EpistemicHealthEvent = {
      contractId: this.latestDecision.contractId,
      score,
      status,
      components: {
        contradiction: contradictionStress,
        calibration: calibrationStress,
        drift: driftStress,
        anomaly: clamp(uncertaintyTopology, 0, 1),
      },
      epistemicHealthScore: score,
      calibrationHealth: clamp(1 - calibrationStress, 0, 1),
      driftHealth: clamp(1 - driftStress, 0, 1),
      anomalyHealth: clamp(1 - uncertaintyTopology, 0, 1),
      stabilityHealth: clamp(1 - contradictionStress, 0, 1),
      healthGrade: healthGradeFromScore(score),
      timestamp: consciousness.timestamp,
    };

    this.bus.emit(EVENTS.SYSTEM_CONSCIOUSNESS, consciousness);
    this.bus.emit(EVENTS.EPISTEMIC_HEALTH, health);
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'organism.epistemic.health',
      value: health.score,
      tags: { status: health.status, contractId: health.contractId },
      timestamp: health.timestamp,
    });
  }
}

function buildInvalidationPath(input: {
  stress: number;
  contradictionDensity: number;
  tradeAllowed: boolean;
  epistemicFloor: number;
}): string {
  if (!input.tradeAllowed) {
    return 'Constitutional decision blocks execution; await governance pass.';
  }
  if (input.stress > 1 - input.epistemicFloor) {
    return 'Epistemic stress breached floor; require recalibration and fresh snapshot.';
  }
  if (input.contradictionDensity > 0.55) {
    return 'Contradiction density too high; force adversarial review cycle.';
  }
  return 'Invalidate on drift escalation, contradiction growth, or confidence floor breach.';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function contradictionSeverity(strength: number): 'low' | 'medium' | 'high' {
  if (strength >= 0.7) {
    return 'high';
  }
  if (strength >= 0.4) {
    return 'medium';
  }
  return 'low';
}

function healthGradeFromScore(score: number): EpistemicHealthEvent['healthGrade'] {
  if (score >= 0.85) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.5) return 'C';
  if (score >= 0.3) return 'D';
  return 'F';
}

function cognitiveStressFromAggregate(stress: number): SystemConsciousnessEvent['cognitiveStressState'] {
  if (stress >= 0.72) {
    return 'critical';
  }
  if (stress >= 0.45) {
    return 'elevated';
  }
  return 'stable';
}

function healthStatusFromAggregate(stress: number): EpistemicHealthEvent['status'] {
  if (stress >= 0.72) {
    return 'critical';
  }
  if (stress >= 0.45) {
    return 'degraded';
  }
  return 'stable';
}
