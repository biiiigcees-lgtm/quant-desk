import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  CausalEdgeState,
  CausalInsight,
  CausalMarketStateEvent,
} from '../../core/schemas/events.js';

// Time window within which event B is considered caused by event A (ms).
const CAUSAL_WINDOW_MS = 500;

// Minimum observations before reporting causal strength.
const MIN_OBSERVATIONS = 4;

// Minimum change in causal strength to emit a new insight.
const INSIGHT_EMIT_THRESHOLD = 0.05;

// Minimum state delta before emitting a new hidden-state market update.
const STATE_EMIT_THRESHOLD = 0.04;

// Causal pairs to track: [cause event, effect event].
const TRACKED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [EVENTS.MICROSTRUCTURE, EVENTS.PROBABILITY],
  [EVENTS.DRIFT_EVENT, EVENTS.CALIBRATION_UPDATE],
  [EVENTS.ANOMALY, EVENTS.EXECUTION_CONTROL],
  [EVENTS.PROBABILITY, EVENTS.STRATEGY_SIGNAL],
];

interface CausalEdge {
  cause: string;
  effect: string;
  opportunities: number;
  transitions: number;
  causalStrength: number;
  lastEmittedStrength: number;
}

interface ContractCausalState {
  recentEvents: Map<string, number>;
  edges: Map<string, CausalEdge>;
  latestMarketState: CausalMarketStateEvent | null;
}

const TRACKED_DIRECTIONS = buildTrackedDirections();

export class CausalWorldModelService {
  private readonly states: Map<string, ContractCausalState> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    const trackedEvents = new Set<string>();
    for (const [cause, effect] of TRACKED_DIRECTIONS) {
      trackedEvents.add(cause);
      trackedEvents.add(effect);
    }

    for (const eventType of trackedEvents) {
      this.bus.on(eventType, (event: { contractId?: string; timestamp: number }) => {
        this.onEvent(event.contractId ?? 'global', eventType, event.timestamp);
      });
    }
  }

  getLatestInsights(): CausalInsight[] {
    const insights: CausalInsight[] = [];
    for (const [contractId, state] of this.states) {
      const timestamp = latestTimestampForState(state);
      for (const edge of state.edges.values()) {
        if (edge.opportunities >= MIN_OBSERVATIONS) {
          insights.push(this.buildInsight(contractId, state, edge, timestamp));
        }
      }
    }
    return insights;
  }

  getLatestState(contractId: string): CausalMarketStateEvent | undefined {
    return this.states.get(contractId)?.latestMarketState ?? undefined;
  }

  getAllStates(): CausalMarketStateEvent[] {
    const states: CausalMarketStateEvent[] = [];
    for (const state of this.states.values()) {
      if (state.latestMarketState) {
        states.push(state.latestMarketState);
      }
    }
    return states;
  }

  private onEvent(contractId: string, eventType: string, timestamp: number): void {
    const state = this.getOrCreateState(contractId);
    const touched = new Set<string>();

    for (const [key, edge] of state.edges) {
      if (eventType === edge.cause) {
        edge.opportunities += 1;
        this.recalculate(edge);
        touched.add(key);
      }

      if (eventType === edge.effect) {
        const causeTimestamp = state.recentEvents.get(edge.cause);
        if (
          causeTimestamp !== undefined &&
          timestamp >= causeTimestamp &&
          timestamp - causeTimestamp <= CAUSAL_WINDOW_MS
        ) {
          edge.transitions += 1;
          this.recalculate(edge);
          touched.add(key);
        }
      }
    }

    state.recentEvents.set(eventType, timestamp);

    for (const key of touched) {
      const edge = state.edges.get(key);
      if (!edge) {
        continue;
      }
      this.maybeEmitInsight(contractId, state, edge, timestamp);
    }

    this.maybeEmitMarketState(contractId, state, timestamp);
  }

  private recalculate(edge: CausalEdge): void {
    edge.causalStrength = edge.opportunities > 0
      ? Number((edge.transitions / edge.opportunities).toFixed(4))
      : 0;
  }

  private maybeEmitInsight(contractId: string, state: ContractCausalState, edge: CausalEdge, timestamp: number): void {
    if (edge.opportunities < MIN_OBSERVATIONS) {
      return;
    }

    if (Math.abs(edge.causalStrength - edge.lastEmittedStrength) < INSIGHT_EMIT_THRESHOLD) {
      return;
    }

    edge.lastEmittedStrength = edge.causalStrength;
    const insight = this.buildInsight(contractId, state, edge, timestamp);
    this.bus.emit<CausalInsight>(EVENTS.CAUSAL_INSIGHT, insight);
  }

  private maybeEmitMarketState(contractId: string, state: ContractCausalState, timestamp: number): void {
    const edgeStates = this.materializeEdgeStates(state).filter((edge) => edge.opportunities >= MIN_OBSERVATIONS);
    if (edgeStates.length === 0) {
      return;
    }

    edgeStates.sort((a, b) => b.causalStrength - a.causalStrength);
    const top = edgeStates[0];
    if (!top) {
      return;
    }
    const entropy = computeEntropy(edgeStates.map((edge) => edge.causalStrength));
    const spuriousRatio = edgeStates.filter((edge) => edge.spurious).length / edgeStates.length;
    const avgReverse = mean(edgeStates.map((edge) => edge.reverseStrength));
    const instabilityRisk = clamp(0.45 * spuriousRatio + 0.35 * avgReverse + 0.2 * entropy, 0, 1);

    const nextState: CausalMarketStateEvent = {
      contractId,
      hiddenState: classifyHiddenState(top),
      confidence: Number(clamp(top.causalStrength * (1 - instabilityRisk), 0, 1).toFixed(4)),
      instabilityRisk: Number(instabilityRisk.toFixed(4)),
      causalEntropy: Number(entropy.toFixed(4)),
      topDriver: {
        cause: top.cause,
        effect: top.effect,
        strength: Number(top.causalStrength.toFixed(4)),
      },
      activeEdges: edgeStates.slice(0, 8),
      timestamp,
    };

    if (!shouldEmitState(state.latestMarketState, nextState)) {
      return;
    }

    state.latestMarketState = nextState;
    this.bus.emit<CausalMarketStateEvent>(EVENTS.MARKET_CAUSAL_STATE, nextState);
  }

  private buildInsight(contractId: string, state: ContractCausalState, edge: CausalEdge, timestamp: number): CausalInsight {
    const reverseStrength = this.getReverseStrength(state, edge);
    const spurious = reverseStrength >= edge.causalStrength * 0.85 && edge.causalStrength > 0.1;
    const confidence = clamp(edge.causalStrength * (1 - reverseStrength), 0, 1);

    return {
      contractId,
      cause: edge.cause,
      effect: edge.effect,
      causalStrength: Number(edge.causalStrength.toFixed(4)),
      reverseStrength: Number(reverseStrength.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      spurious,
      timestamp,
    };
  }

  private getOrCreateState(contractId: string): ContractCausalState {
    let state = this.states.get(contractId);
    if (state) {
      return state;
    }

    const edges = new Map<string, CausalEdge>();
    for (const [cause, effect] of TRACKED_DIRECTIONS) {
      edges.set(edgeKey(cause, effect), this.makeEdge(cause, effect));
    }

    state = {
      recentEvents: new Map<string, number>(),
      edges,
      latestMarketState: null,
    };
    this.states.set(contractId, state);
    return state;
  }

  private materializeEdgeStates(state: ContractCausalState): CausalEdgeState[] {
    const result: CausalEdgeState[] = [];

    for (const edge of state.edges.values()) {
      const reverseStrength = this.getReverseStrength(state, edge);
      const spurious = reverseStrength >= edge.causalStrength * 0.85 && edge.causalStrength > 0.1;
      const confidence = clamp(edge.causalStrength * (1 - reverseStrength), 0, 1);

      result.push({
        cause: edge.cause,
        effect: edge.effect,
        opportunities: edge.opportunities,
        transitions: edge.transitions,
        causalStrength: Number(edge.causalStrength.toFixed(4)),
        reverseStrength: Number(reverseStrength.toFixed(4)),
        confidence: Number(confidence.toFixed(4)),
        spurious,
      });
    }

    return result;
  }

  private getReverseStrength(state: ContractCausalState, edge: CausalEdge): number {
    const reverse = state.edges.get(edgeKey(edge.effect, edge.cause));
    return reverse?.causalStrength ?? 0;
  }

  private makeEdge(cause: string, effect: string): CausalEdge {
    return {
      cause,
      effect,
      opportunities: 0,
      transitions: 0,
      causalStrength: 0,
      lastEmittedStrength: -1,
    };
  }
}

function buildTrackedDirections(): Array<[string, string]> {
  const seen = new Set<string>();
  const result: Array<[string, string]> = [];

  for (const [source, target] of TRACKED_PAIRS) {
    const forward = edgeKey(source, target);
    if (!seen.has(forward)) {
      seen.add(forward);
      result.push([source, target]);
    }

    const reverse = edgeKey(target, source);
    if (!seen.has(reverse)) {
      seen.add(reverse);
      result.push([target, source]);
    }
  }

  return result;
}

function edgeKey(cause: string, effect: string): string {
  return `${cause}→${effect}`;
}

function classifyHiddenState(edge: CausalEdgeState): CausalMarketStateEvent['hiddenState'] {
  if (edge.spurious || edge.reverseStrength >= edge.causalStrength * 0.9) {
    return 'mean-reversion-pressure';
  }

  if (edge.cause === EVENTS.ANOMALY || edge.effect === EVENTS.EXECUTION_CONTROL) {
    return 'panic-feedback';
  }

  if (edge.cause === EVENTS.DRIFT_EVENT || edge.effect === EVENTS.CALIBRATION_UPDATE) {
    return 'liquidity-fragility';
  }

  if (edge.cause === EVENTS.MICROSTRUCTURE && edge.effect === EVENTS.PROBABILITY) {
    return 'momentum-continuation';
  }

  return 'neutral';
}

function shouldEmitState(
  previous: CausalMarketStateEvent | null,
  next: CausalMarketStateEvent,
): boolean {
  if (!previous) {
    return true;
  }

  if (previous.hiddenState !== next.hiddenState) {
    return true;
  }

  if (
    previous.topDriver?.cause !== next.topDriver?.cause ||
    previous.topDriver?.effect !== next.topDriver?.effect
  ) {
    return true;
  }

  return (
    Math.abs(previous.confidence - next.confidence) >= STATE_EMIT_THRESHOLD ||
    Math.abs(previous.instabilityRisk - next.instabilityRisk) >= STATE_EMIT_THRESHOLD ||
    Math.abs(previous.causalEntropy - next.causalEntropy) >= STATE_EMIT_THRESHOLD
  );
}

function computeEntropy(values: number[]): number {
  const positives = values.filter((value) => value > 0);
  if (positives.length <= 1) {
    return 0;
  }

  const total = positives.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return 0;
  }

  const entropy = positives.reduce((sum, value) => {
    const probability = value / total;
    return sum - probability * Math.log(probability);
  }, 0);

  return entropy / Math.log(positives.length);
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function latestTimestampForState(state: ContractCausalState): number {
  const values = Array.from(state.recentEvents.values());
  if (values.length === 0) {
    return 1;
  }
  return Math.max(...values);
}
