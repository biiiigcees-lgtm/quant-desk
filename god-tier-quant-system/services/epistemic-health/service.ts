import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
import {
  AnomalyEvent,
  CalibrationEvent,
  CausalInsight,
  DriftEvent,
  EpistemicHealthEvent,
  ExecutionControlEvent,
  RealitySnapshot,
} from '../../core/schemas/events.js';

const WINDOW = 20;

const DRIFT_HEALTH: Record<string, number> = { none: 1.0, low: 0.85, medium: 0.6, high: 0.3 };
const ANOMALY_HEALTH: Record<string, number> = {
  none: 1.0, low: 0.8, medium: 0.55, high: 0.25, critical: 0.0,
};

interface EpistemicState {
  eceWindow: number[];
  truthScoreWindow: number[];
  latestDriftSeverity: string;
  latestAnomalySeverity: string;
  latestContractId: string;
  lastEmittedSafeMode: boolean;
}

function pushWindow(arr: number[], val: number): void {
  arr.push(val);
  if (arr.length > WINDOW) arr.shift();
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / arr.length;
}

export class EpistemicHealthService {
  private readonly state: EpistemicState = {
    eceWindow: [],
    truthScoreWindow: [],
    latestDriftSeverity: 'none',
    latestAnomalySeverity: 'none',
    latestContractId: 'global',
    lastEmittedSafeMode: false,
  };
  private readonly latest: Map<string, EpistemicHealthEvent> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<CalibrationEvent>(EVENTS.CALIBRATION_UPDATE, safeHandler((e) => {
      pushWindow(this.state.eceWindow, e.ece);
      this.state.latestContractId = e.contractId;
      this.emit(e.contractId);
    }, 'EpistemicHealth.calibration'));

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, safeHandler((e) => {
      this.state.latestDriftSeverity = e.severity;
      this.state.latestContractId = e.contractId;
      this.emit(e.contractId);
    }, 'EpistemicHealth.drift'));

    this.bus.on<AnomalyEvent>(EVENTS.ANOMALY, safeHandler((e) => {
      this.state.latestAnomalySeverity = e.severity;
      this.state.latestContractId = e.contractId;
      this.emit(e.contractId);
    }, 'EpistemicHealth.anomaly'));

    this.bus.on<CausalInsight>(EVENTS.CAUSAL_INSIGHT, safeHandler((e) => {
      this.state.latestContractId = e.contractId;
      this.emit(e.contractId);
    }, 'EpistemicHealth.causal'));

    this.bus.on<RealitySnapshot>(EVENTS.REALITY_SNAPSHOT, safeHandler((e) => {
      pushWindow(this.state.truthScoreWindow, e.truthScore);
      this.state.latestContractId = e.contractId;
      this.emit(e.contractId);
    }, 'EpistemicHealth.reality'));
  }

  getLatestHealth(contractId: string): EpistemicHealthEvent | undefined {
    return this.latest.get(contractId) ?? this.latest.get('global');
  }

  private emit(contractId: string): void {
    const s = this.state;
    const ece = s.eceWindow.length > 0 ? s.eceWindow[s.eceWindow.length - 1]! : 0;

    const calibrationHealth = Math.max(0, Math.min(1, 1 - mean(s.eceWindow) * 5));
    const driftHealth = DRIFT_HEALTH[s.latestDriftSeverity] ?? 1.0;
    const anomalyHealth = ANOMALY_HEALTH[s.latestAnomalySeverity] ?? 1.0;
    const stabilityHealth = Math.max(0, Math.min(1, 1 - variance(s.truthScoreWindow) * 3));
    const score = Number((
      calibrationHealth * 0.35 +
      driftHealth * 0.25 +
      anomalyHealth * 0.25 +
      stabilityHealth * 0.15
    ).toFixed(4));

    const healthGrade: 'A' | 'B' | 'C' | 'D' | 'F' =
      score >= 0.85 ? 'A' :
      score >= 0.70 ? 'B' :
      score >= 0.50 ? 'C' :
      score >= 0.30 ? 'D' : 'F';

    const event: EpistemicHealthEvent = {
      contractId,
      epistemicHealthScore: score,
      calibrationHealth: Number(calibrationHealth.toFixed(4)),
      driftHealth: Number(driftHealth.toFixed(4)),
      anomalyHealth: Number(anomalyHealth.toFixed(4)),
      stabilityHealth: Number(stabilityHealth.toFixed(4)),
      healthGrade,
      timestamp: Date.now(),
    };

    this.latest.set(contractId, event);
    this.bus.emit<EpistemicHealthEvent>(EVENTS.EPISTEMIC_HEALTH, event);

    // Cross threshold into degraded epistemic state → trigger safe-mode
    const nowDegraded = score < 0.40;
    if (nowDegraded && !s.lastEmittedSafeMode) {
      s.lastEmittedSafeMode = true;
      this.bus.emit<ExecutionControlEvent>(EVENTS.EXECUTION_CONTROL, {
        contractId,
        mode: 'safe-mode',
        reason: `epistemic-health-degraded:${score.toFixed(3)}`,
        ece,
        timestamp: Date.now(),
      });
    } else if (!nowDegraded && s.lastEmittedSafeMode) {
      s.lastEmittedSafeMode = false;
    }
  }
}
