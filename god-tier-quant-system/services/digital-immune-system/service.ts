import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { AnomalyEvent, DigitalImmuneAlertEvent, EpistemicHealthEvent, ValidationResultEvent } from '../../core/schemas/events.js';

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
        this.triggerAlert('critical', event.contractId, 'epistemic-health-critical');
      }
    });

    this.bus.on<AnomalyEvent>(EVENTS.ANOMALY, (event) => {
      this.lastContractId = event.contractId;
      if (event.severity === 'critical' || event.severity === 'high') {
        this.triggerAlert(event.severity === 'critical' ? 'critical' : 'elevated', event.contractId, `anomaly-${event.type}`);
      }
    });

    this.bus.on<ValidationResultEvent>(EVENTS.VALIDATION_RESULT, (event) => {
      this.lastContractId = event.contractId;
      if (event.status === 'fail' && event.kind === 'adversarial') {
        this.triggerAlert('elevated', event.contractId, 'adversarial-validation-failure');
      }
    });
  }

  private triggerAlert(level: 'elevated' | 'critical', contractId: string, reason: string): void {
    const now = Date.now();
    if (now < this.cooldownUntil) {
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
