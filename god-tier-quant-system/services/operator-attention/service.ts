import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  AdversarialAuditEvent,
  MetaCalibrationEvent,
  OperatorAttentionEvent,
  SystemConsciousnessEvent,
} from '../../core/schemas/events.js';

interface AttentionState {
  consciousness?: SystemConsciousnessEvent;
  adversarial?: AdversarialAuditEvent;
  calibration?: MetaCalibrationEvent;
  anomalySeverity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export class OperatorAttentionService {
  private readonly byContract = new Map<string, AttentionState>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<SystemConsciousnessEvent>(EVENTS.SYSTEM_CONSCIOUSNESS, (event) => {
      const state = this.getState(event.contractId);
      state.consciousness = event;
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on<AdversarialAuditEvent>(EVENTS.ADVERSARIAL_AUDIT, (event) => {
      const state = this.getState(event.contractId);
      state.adversarial = event;
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on<MetaCalibrationEvent>(EVENTS.META_CALIBRATION, (event) => {
      const state = this.getState(event.contractId);
      state.calibration = event;
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on(EVENTS.ANOMALY, (event: { contractId: string; severity: AttentionState['anomalySeverity']; timestamp: number }) => {
      const state = this.getState(event.contractId);
      state.anomalySeverity = event.severity;
      this.emit(event.contractId, event.timestamp);
    });
  }

  private getState(contractId: string): AttentionState {
    const current = this.byContract.get(contractId);
    if (current) {
      return current;
    }
    const next: AttentionState = {
      anomalySeverity: 'none',
    };
    this.byContract.set(contractId, next);
    return next;
  }

  private emit(contractId: string, timestamp: number): void {
    const state = this.byContract.get(contractId);
    if (!state) {
      return;
    }

    const contradictionHotspots = state.consciousness?.contradictions
      .slice(0, 4)
      .map((item) => `${item.source}->${item.target}`) ?? [];

    const priority: string[] = [];
    if ((state.calibration?.authorityDecay ?? 0) > 0.55) {
      priority.push('meta-calibration-decay');
    }
    if ((state.adversarial?.adversarialScore ?? 0) > 0.55) {
      priority.push('adversarial-counterfactual');
    }
    if ((state.consciousness?.contradictionDensity ?? 0) > 0.35) {
      priority.push('contradiction-resolution');
    }
    if (state.anomalySeverity === 'high' || state.anomalySeverity === 'critical') {
      priority.push('anomaly-triage');
    }

    const critical =
      (state.calibration?.authorityDecay ?? 0) > 0.75 ||
      state.anomalySeverity === 'critical' ||
      (state.adversarial?.adversarialScore ?? 0) > 0.8;

    const focused =
      (state.calibration?.authorityDecay ?? 0) > 0.55 ||
      (state.consciousness?.contradictionDensity ?? 0) > 0.35 ||
      (state.adversarial?.adversarialScore ?? 0) > 0.55 ||
      state.anomalySeverity === 'high';

    const focus: OperatorAttentionEvent['focus'] = deriveFocus(critical, focused);
    const density = densityFromFocus(focus);

    const event: OperatorAttentionEvent = {
      contractId,
      focus,
      priority: priority.length > 0 ? priority : ['normal-monitoring'],
      contradictionHotspots,
      density,
      timestamp,
    };

    this.bus.emit<OperatorAttentionEvent>(EVENTS.OPERATOR_ATTENTION, event);
  }
}

function deriveFocus(critical: boolean, focused: boolean): OperatorAttentionEvent['focus'] {
  if (critical) {
    return 'critical';
  }
  if (focused) {
    return 'focused';
  }
  return 'normal';
}

function densityFromFocus(focus: OperatorAttentionEvent['focus']): number {
  if (focus === 'critical') {
    return 0.92;
  }
  if (focus === 'focused') {
    return 0.68;
  }
  return 0.4;
}
