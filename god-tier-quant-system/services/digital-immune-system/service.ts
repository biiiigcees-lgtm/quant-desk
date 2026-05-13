import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  AnomalyEvent,
  DigitalImmuneAlertEvent,
  EpistemicHealthEvent,
  MarketExperienceEvent,
  MetaCalibrationEvent,
  ReplayIntegrityEvent,
  SystemConsciousnessEvent,
  ValidationResultEvent,
} from '../../core/schemas/events.js';

interface ImmuneOptions {
  cooldownMs: number;
}

export class DigitalImmuneSystemService {
  private cooldownUntil = 0;
  private lastContractId = 'KXBTC-DEMO';

  constructor(
    private readonly bus: EventBus,
    private readonly options: ImmuneOptions,
  ) {}

  start(): void {
    this.bus.on<EpistemicHealthEvent>(EVENTS.EPISTEMIC_HEALTH, (event) => {
      this.lastContractId = event.contractId;
      if (event.status === 'critical') {
        this.triggerAlert('critical', event.contractId, 'epistemic-health-critical', event.timestamp);
      }
    });

    this.bus.on<AnomalyEvent>(EVENTS.ANOMALY, (event) => {
      this.lastContractId = event.contractId;
      if (event.severity === 'critical' || event.severity === 'high') {
        this.triggerAlert(
          event.severity === 'critical' ? 'critical' : 'elevated',
          event.contractId,
          `anomaly-${event.type}`,
          event.timestamp,
        );
      }
    });

    this.bus.on<ValidationResultEvent>(EVENTS.VALIDATION_RESULT, (event) => {
      this.lastContractId = event.contractId;
      if (event.status === 'fail' && event.kind === 'adversarial') {
        this.triggerAlert('elevated', event.contractId, 'adversarial-validation-failure', event.timestamp);
      }
    });

    this.bus.on<MetaCalibrationEvent>(EVENTS.META_CALIBRATION, (event) => {
      this.lastContractId = event.contractId;
      if (event.authorityDecay > 0.85) {
        this.triggerAlert('critical', event.contractId, 'meta-calibration-authority-decay', event.timestamp);
      } else if (event.authorityDecay > 0.7) {
        this.triggerAlert('elevated', event.contractId, 'meta-calibration-warning', event.timestamp);
      }
    });

    this.bus.on<SystemConsciousnessEvent>(EVENTS.SYSTEM_CONSCIOUSNESS, (event) => {
      this.lastContractId = event.contractId;
      if ((event.trustDecay ?? 0) > 0.78 || (event.selfTrustScore ?? 1) < 0.3) {
        this.triggerAlert('critical', event.contractId, 'system-trust-collapse', event.timestamp);
      } else if ((event.trustDecay ?? 0) > 0.62 || (event.selfTrustScore ?? 1) < 0.42) {
        this.triggerAlert('elevated', event.contractId, 'system-trust-degraded', event.timestamp);
      }
    });

    this.bus.on<MarketExperienceEvent>(EVENTS.MARKET_EXPERIENCE, (event) => {
      this.lastContractId = event.contractId;
      if (event.recurringFailureSignature && event.traumaPenalty > 0.82) {
        this.triggerAlert('critical', event.contractId, 'market-memory-trauma-critical', event.timestamp);
      } else if (event.recurringFailureSignature && event.traumaPenalty > 0.64) {
        this.triggerAlert('elevated', event.contractId, 'market-memory-trauma-warning', event.timestamp);
      }
    });

    this.bus.on<ReplayIntegrityEvent>(EVENTS.REPLAY_INTEGRITY, (event) => {
      if (!event.deterministic) {
        this.triggerAlert('critical', this.lastContractId, 'replay-integrity-divergence', event.timestamp);
      }
    });
  }

  private triggerAlert(level: 'elevated' | 'critical', contractId: string, reason: string, observedTs: number): void {
    const now = Number.isFinite(observedTs) ? observedTs : Date.now();
    if (now <= this.cooldownUntil) {
      return;
    }

    const mode = level === 'critical' ? 'hard-stop' : 'safe-mode';
    this.cooldownUntil = now + this.options.cooldownMs;

    const alert: DigitalImmuneAlertEvent = {
      contractId: contractId || this.lastContractId,
      threatLevel: level,
      reason,
      recommendedMode: mode,
      cooldownUntil: this.cooldownUntil,
      timestamp: now,
    };

    this.bus.emit(EVENTS.DIGITAL_IMMUNE_ALERT, alert);
    this.bus.emit(EVENTS.EXECUTION_CONTROL, {
      contractId: alert.contractId,
      mode,
      reason: `digital-immune:${reason}`,
      timestamp: now,
    });
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'organism.immune.alert',
      value: level === 'critical' ? 1 : 0.5,
      tags: { level, contractId: alert.contractId },
      timestamp: now,
    });
  }
}
