import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  CalibrationEvent,
  DriftEvent,
  ExecutionStateEvent,
  MetaCalibrationEvent,
  ProbabilityEvent,
} from '../../core/schemas/events.js';

interface ContractMetaState {
  signalCalibration: number;
  aiCalibration: number;
  executionCalibration: number;
  regimeCalibration: number;
  uncertaintyCalibration: number;
  successWindow: Array<'success' | 'failure'>;
  lastMode?: 'normal' | 'safe-mode' | 'hard-stop';
}

const WINDOW = 30;

export class MetaCalibrationService {
  private readonly byContract = new Map<string, ContractMetaState>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<CalibrationEvent>(EVENTS.CALIBRATION_UPDATE, (event) => {
      const state = this.getState(event.contractId);
      state.signalCalibration = clamp(event.calibratedConfidence, 0, 1);
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, (event) => {
      const state = this.getState(event.contractId);
      state.uncertaintyCalibration = clamp(1 - event.uncertaintyScore, 0, 1);
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, (event) => {
      const state = this.getState(event.contractId);
      state.regimeCalibration = regimeCalibrationFromDriftSeverity(event.severity);
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event: {
      contractId?: string;
      probability_adjustment?: { calibrationScore?: number };
      timestamp?: number;
    }) => {
      const contractId = event.contractId ?? 'global';
      const state = this.getState(contractId);
      state.aiCalibration = clamp(Number(event.probability_adjustment?.calibrationScore ?? 0), 0, 1);
      this.emit(contractId, Number(event.timestamp ?? Date.now()));
    });

    this.bus.on<ExecutionStateEvent>(EVENTS.EXECUTION_STATE, (event) => {
      const state = this.getState(event.contractId);
      const outcome = classifyExecutionOutcome(event.phase);

      if (outcome) {
        state.successWindow.push(outcome);
        if (state.successWindow.length > WINDOW) {
          state.successWindow.shift();
        }
      }

      const failures = state.successWindow.filter((x) => x === 'failure').length;
      const ratio = state.successWindow.length === 0 ? 0 : failures / state.successWindow.length;
      state.executionCalibration = clamp(1 - ratio, 0, 1);
      this.emit(event.contractId, event.timestamp);
    });
  }

  private getState(contractId: string): ContractMetaState {
    const current = this.byContract.get(contractId);
    if (current) {
      return current;
    }

    const next: ContractMetaState = {
      signalCalibration: 0.7,
      aiCalibration: 0.65,
      executionCalibration: 0.75,
      regimeCalibration: 0.75,
      uncertaintyCalibration: 0.7,
      successWindow: [],
    };
    this.byContract.set(contractId, next);
    return next;
  }

  private emit(contractId: string, timestamp: number): void {
    const state = this.byContract.get(contractId);
    if (!state) {
      return;
    }

    const compositeScore = clamp(
      state.signalCalibration * 0.28 +
      state.aiCalibration * 0.2 +
      state.executionCalibration * 0.2 +
      state.regimeCalibration * 0.17 +
      state.uncertaintyCalibration * 0.15,
      0,
      1,
    );

    const authorityDecay = clamp(1 - compositeScore, 0, 1);

    const event: MetaCalibrationEvent = {
      contractId,
      signalCalibration: Number(state.signalCalibration.toFixed(4)),
      aiCalibration: Number(state.aiCalibration.toFixed(4)),
      executionCalibration: Number(state.executionCalibration.toFixed(4)),
      regimeCalibration: Number(state.regimeCalibration.toFixed(4)),
      uncertaintyCalibration: Number(state.uncertaintyCalibration.toFixed(4)),
      compositeScore: Number(compositeScore.toFixed(4)),
      authorityDecay: Number(authorityDecay.toFixed(4)),
      timestamp,
    };

    this.bus.emit<MetaCalibrationEvent>(EVENTS.META_CALIBRATION, event);
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'meta.calibration.composite',
      value: event.compositeScore,
      tags: { contractId },
      timestamp,
    });

    const mode = modeFromAuthorityDecay(authorityDecay);
    if (mode !== 'normal' && mode !== state.lastMode) {
      this.bus.emit(EVENTS.EXECUTION_CONTROL, {
        contractId,
        mode,
        reason: `meta-calibration-decay:${authorityDecay.toFixed(3)}`,
        timestamp,
      });
    }
    state.lastMode = mode;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function regimeCalibrationFromDriftSeverity(severity: DriftEvent['severity']): number {
  if (severity === 'high') {
    return 0.35;
  }
  if (severity === 'medium') {
    return 0.62;
  }
  return 0.86;
}

function classifyExecutionOutcome(phase: ExecutionStateEvent['phase']): 'success' | 'failure' | undefined {
  if (phase === 'filled' || phase === 'partially_filled') {
    return 'success';
  }
  if (phase === 'rejected' || phase === 'expired' || phase === 'cancelled') {
    return 'failure';
  }
  return undefined;
}

function modeFromAuthorityDecay(authorityDecay: number): ContractMetaState['lastMode'] {
  if (authorityDecay >= 0.82) {
    return 'hard-stop';
  }
  if (authorityDecay >= 0.62) {
    return 'safe-mode';
  }
  return 'normal';
}
