import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
import {
  DriftEvent,
  GlobalContextEvent,
  MicrostructureEvent,
  MultiTimescaleViewEvent,
  ProbabilityEvent,
} from '../../core/schemas/events.js';

const TICK_WINDOW = 10;
const LOCAL_WINDOW = 30;
const REGIME_WINDOW = 5;
const MACRO_WINDOW = 3;

interface TimescaleResult {
  direction: 1 | 0 | -1;
  strength: number;
}

interface ContractCognitionState {
  tickWindow: MicrostructureEvent[];
  localWindow: ProbabilityEvent[];
  regimeWindow: DriftEvent[];
  macroWindow: GlobalContextEvent[];
  latestContractId: string;
}

function pushWindow<T>(arr: T[], item: T, max: number): void {
  arr.push(item);
  if (arr.length > max) arr.shift();
}

function sign(val: number, threshold = 0.005): 1 | 0 | -1 {
  return val > threshold ? 1 : val < -threshold ? -1 : 0;
}

export class MultiTimescaleCognitionService {
  private readonly states: Map<string, ContractCognitionState> = new Map();
  private readonly latest: Map<string, MultiTimescaleViewEvent> = new Map();
  // Global macro window (no contractId on GlobalContextEvent)
  private readonly macroWindow: GlobalContextEvent[] = [];
  private latestContractId = 'global';

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, safeHandler((e) => {
      const s = this.getOrCreate(e.contractId);
      this.latestContractId = e.contractId;
      pushWindow(s.tickWindow, e, TICK_WINDOW);
      this.emit(e.contractId);
    }, 'MultiTimescale.micro'));

    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, safeHandler((e) => {
      const s = this.getOrCreate(e.contractId);
      this.latestContractId = e.contractId;
      pushWindow(s.localWindow, e, LOCAL_WINDOW);
      this.emit(e.contractId);
    }, 'MultiTimescale.probability'));

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, safeHandler((e) => {
      const s = this.getOrCreate(e.contractId);
      this.latestContractId = e.contractId;
      pushWindow(s.regimeWindow, e, REGIME_WINDOW);
      this.emit(e.contractId);
    }, 'MultiTimescale.drift'));

    this.bus.on<GlobalContextEvent>(EVENTS.GLOBAL_CONTEXT, safeHandler((e) => {
      pushWindow(this.macroWindow, e, MACRO_WINDOW);
      this.emit(this.latestContractId);
    }, 'MultiTimescale.global'));
  }

  getLatestView(contractId: string): MultiTimescaleViewEvent | undefined {
    return this.latest.get(contractId);
  }

  private getOrCreate(contractId: string): ContractCognitionState {
    if (!this.states.has(contractId)) {
      this.states.set(contractId, {
        tickWindow: [], localWindow: [], regimeWindow: [],
        macroWindow: [], latestContractId: contractId,
      });
    }
    return this.states.get(contractId)!;
  }

  private tickView(events: MicrostructureEvent[]): TimescaleResult {
    if (events.length === 0) return { direction: 0, strength: 0 };
    const avgObi = events.reduce((s, e) => s + e.obi, 0) / events.length;
    const avgVel = events.reduce((s, e) => s + e.obiVelocity, 0) / events.length;
    return {
      direction: sign(avgObi, 0.1),
      strength: Number(Math.min(1, Math.abs(avgObi) + Math.abs(avgVel) * 0.5).toFixed(4)),
    };
  }

  private localView(events: ProbabilityEvent[]): TimescaleResult {
    if (events.length < 2) return { direction: 0, strength: 0 };
    const first = events[0]!.estimatedProbability;
    const last = events[events.length - 1]!.estimatedProbability;
    const delta = last - first;
    const avgEdge = events.reduce((s, e) => s + Math.abs(e.edge), 0) / events.length;
    return {
      direction: sign(delta, 0.005),
      strength: Number(Math.min(1, Math.abs(delta) * 20 + avgEdge * 5).toFixed(4)),
    };
  }

  private regimeView(events: DriftEvent[]): TimescaleResult {
    if (events.length === 0) return { direction: 0, strength: 0 };
    const sevMap: Record<string, number> = { low: 0.2, medium: 0.6, high: 1.0 };
    const avgSev = events.reduce((s, e) => s + (sevMap[e.severity] ?? 0.2), 0) / events.length;
    const avgKl = events.reduce((s, e) => s + e.kl, 0) / events.length;
    // High drift severity = adverse = bearish signal
    return {
      direction: sign(-(avgSev - 0.3), 0.1),
      strength: Number(Math.min(1, avgKl * 2 + avgSev * 0.3).toFixed(4)),
    };
  }

  private macroView(events: GlobalContextEvent[]): TimescaleResult {
    if (events.length === 0) return { direction: 0, strength: 0 };
    const last = events[events.length - 1]!;
    const dir: 1 | 0 | -1 =
      last.marketRegime === 'risk-on' ? 1 :
      last.marketRegime === 'risk-off' ? -1 : 0;
    const avgStress = events.reduce((s, e) => s + e.stressIndex, 0) / events.length;
    return {
      direction: dir,
      strength: Number(Math.min(1, avgStress).toFixed(4)),
    };
  }

  private computeCoherence(views: TimescaleResult[]): number {
    const dirs = views.map((v) => v.direction);
    const upCount = dirs.filter((d) => d === 1).length;
    const downCount = dirs.filter((d) => d === -1).length;
    return Number((Math.max(upCount, downCount) / views.length).toFixed(4));
  }

  private emit(contractId: string): void {
    const s = this.states.get(contractId);
    if (!s) return;

    const tick = this.tickView(s.tickWindow);
    const local = this.localView(s.localWindow);
    const regime = this.regimeView(s.regimeWindow);
    const macro = this.macroView(this.macroWindow);

    const coherenceScore = this.computeCoherence([tick, local, regime, macro]);
    const temporalAlignment: 'aligned' | 'mixed' | 'divergent' =
      coherenceScore >= 0.75 ? 'aligned' :
      coherenceScore >= 0.5 ? 'mixed' : 'divergent';

    const event: MultiTimescaleViewEvent = {
      contractId,
      tick,
      local,
      regime,
      macro,
      coherenceScore,
      temporalAlignment,
      timestamp: Date.now(),
    };

    this.latest.set(contractId, event);
    this.bus.emit<MultiTimescaleViewEvent>(EVENTS.MULTI_TIMESCALE_VIEW, event);
  }
}
