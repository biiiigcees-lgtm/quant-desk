import { EventBus } from '../event-bus/bus.js';
import { EVENTS } from '../event-bus/events.js';
import { safeHandler } from '../errors/handler.js';
import type {
  AnomalyEvent,
  DigitalImmuneAlertEvent,
  EpistemicHealthEvent,
  ExecutionControlEvent,
  GovernanceMode,
  RiskGovernanceEvent,
} from '../schemas/events.js';

const MODE_PRIORITY: Record<GovernanceMode, number> = {
  NORMAL: 0,
  DEGRADED: 1,
  SAFE: 2,
  LOCKED: 3,
};

type ModeListener = (mode: GovernanceMode, reason: string) => void;

export class RiskGovernor {
  private mode: GovernanceMode = 'NORMAL';
  private readonly reasons = new Map<string, GovernanceMode>();
  private readonly listeners = new Set<ModeListener>();
  private lockedAt: number | null = null;

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<EpistemicHealthEvent>(EVENTS.EPISTEMIC_HEALTH, safeHandler((e) => {
      if (e.score < 0.20) {
        this.elevate('epistemic:critical', 'LOCKED', `epistemic-score=${e.score.toFixed(3)}`);
      } else if (e.score < 0.40) {
        this.release('epistemic:critical');
        this.elevate('epistemic:degraded', 'SAFE', `epistemic-score=${e.score.toFixed(3)}`);
      } else if (e.score < 0.60) {
        this.release('epistemic:critical');
        this.release('epistemic:degraded');
        this.elevate('epistemic:weak', 'DEGRADED', `epistemic-score=${e.score.toFixed(3)}`);
      } else {
        this.release('epistemic:critical');
        this.release('epistemic:degraded');
        this.release('epistemic:weak');
      }
    }, 'RiskGovernor.epistemicHealth'));

    this.bus.on<ExecutionControlEvent>(EVENTS.EXECUTION_CONTROL, safeHandler((e) => {
      if (e.mode === 'hard-stop') {
        this.elevate('execution-control:hard-stop', 'LOCKED', `execution-control-hard-stop: ${e.reason}`);
      } else if (e.mode === 'safe-mode') {
        this.elevate('execution-control:safe-mode', 'SAFE', `execution-control-safe-mode: ${e.reason}`);
      } else {
        this.release('execution-control:safe-mode');
      }
    }, 'RiskGovernor.executionControl'));

    this.bus.on<AnomalyEvent>(EVENTS.ANOMALY, safeHandler((e) => {
      if (e.severity === 'critical') {
        this.elevate('anomaly:critical', 'DEGRADED', `critical-anomaly: ${e.type} on ${e.contractId}`);
      } else {
        this.release('anomaly:critical');
      }
    }, 'RiskGovernor.anomaly'));

    this.bus.on<DigitalImmuneAlertEvent>(EVENTS.DIGITAL_IMMUNE_ALERT, safeHandler((e) => {
      if (e.threatLevel === 'critical') {
        this.elevate('immune:critical', 'LOCKED', `digital-immune-critical: ${e.reason}`);
      } else {
        this.elevate('immune:elevated', 'SAFE', `digital-immune-elevated: ${e.reason}`);
      }
    }, 'RiskGovernor.immuneAlert'));
  }

  getMode(): GovernanceMode {
    return this.mode;
  }

  canExecute(): boolean {
    return this.mode === 'NORMAL' || this.mode === 'DEGRADED';
  }

  isLocked(): boolean {
    return this.mode === 'LOCKED';
  }

  lockedSince(): number | null {
    return this.lockedAt;
  }

  subscribe(fn: ModeListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private elevate(key: string, targetMode: GovernanceMode, detail: string): void {
    if (this.mode === 'LOCKED') return;
    this.reasons.set(key, targetMode);
    this.recompute(detail);
  }

  private release(key: string): void {
    if (this.mode === 'LOCKED') return;
    this.reasons.delete(key);
    this.recompute(`released:${key}`);
  }

  private recompute(reason: string): void {
    if (this.mode === 'LOCKED') return;

    let maxMode: GovernanceMode = 'NORMAL';
    for (const m of this.reasons.values()) {
      if (MODE_PRIORITY[m] > MODE_PRIORITY[maxMode]) {
        maxMode = m;
      }
    }

    if (maxMode === this.mode) return;

    const previousMode = this.mode;
    this.mode = maxMode;

    if (maxMode === 'LOCKED') {
      this.lockedAt = Date.now();
    }

    const event: RiskGovernanceEvent = {
      mode: this.mode,
      previousMode,
      reason,
      timestamp: Date.now(),
    };

    this.bus.emit<RiskGovernanceEvent>(EVENTS.RISK_GOVERNANCE, event);

    this.bus.emit(EVENTS.TELEMETRY, {
      level: this.mode === 'NORMAL' ? 'info' : this.mode === 'DEGRADED' ? 'warn' : 'error',
      context: 'RiskGovernor',
      message: `governance mode ${previousMode} → ${this.mode}`,
      mode: this.mode,
      previousMode,
      reason,
      timestamp: Date.now(),
    });

    for (const fn of this.listeners) {
      try {
        fn(this.mode, reason);
      } catch {
        // never throw from listeners
      }
    }
  }
}
