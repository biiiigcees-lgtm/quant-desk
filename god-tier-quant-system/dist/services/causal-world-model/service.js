import { EVENTS } from '../../core/event-bus/events.js';
// Time window within which event B is considered caused by event A (ms).
const CAUSAL_WINDOW_MS = 500;
// Minimum observations before reporting causal strength.
const MIN_OBSERVATIONS = 4;
// Minimum change in causal strength to emit a new insight.
const INSIGHT_EMIT_THRESHOLD = 0.05;
// Minimum state delta before emitting a new hidden-state market update.
const STATE_EMIT_THRESHOLD = 0.04;
// Causal pairs to track: [cause event, effect event].
const TRACKED_PAIRS = [
    [EVENTS.MICROSTRUCTURE, EVENTS.PROBABILITY],
    [EVENTS.DRIFT_EVENT, EVENTS.CALIBRATION_UPDATE],
    [EVENTS.ANOMALY, EVENTS.EXECUTION_CONTROL],
    [EVENTS.PROBABILITY, EVENTS.STRATEGY_SIGNAL],
];
const TRACKED_DIRECTIONS = buildTrackedDirections();
export class CausalWorldModelService {
    constructor(bus) {
        this.bus = bus;
        this.states = new Map();
    }
    start() {
        const trackedEvents = new Set();
        for (const [cause, effect] of TRACKED_DIRECTIONS) {
            trackedEvents.add(cause);
            trackedEvents.add(effect);
        }
        for (const eventType of trackedEvents) {
            this.bus.on(eventType, (event) => {
                this.onEvent(event.contractId ?? 'global', eventType, event.timestamp);
            });
        }
    }
    getLatestInsights() {
        const insights = [];
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
    getLatestState(contractId) {
        return this.states.get(contractId)?.latestMarketState ?? undefined;
    }
    getAllStates() {
        const states = [];
        for (const state of this.states.values()) {
            if (state.latestMarketState) {
                states.push(state.latestMarketState);
            }
        }
        return states;
    }
    onEvent(contractId, eventType, timestamp) {
        const state = this.getOrCreateState(contractId);
        const touched = new Set();
        for (const [key, edge] of state.edges) {
            if (eventType === edge.cause) {
                edge.opportunities += 1;
                this.recalculate(edge);
                touched.add(key);
            }
            if (eventType === edge.effect) {
                const causeTimestamp = state.recentEvents.get(edge.cause);
                if (causeTimestamp !== undefined &&
                    timestamp >= causeTimestamp &&
                    timestamp - causeTimestamp <= CAUSAL_WINDOW_MS) {
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
    recalculate(edge) {
        edge.causalStrength = edge.opportunities > 0
            ? Number((edge.transitions / edge.opportunities).toFixed(4))
            : 0;
    }
    maybeEmitInsight(contractId, state, edge, timestamp) {
        if (edge.opportunities < MIN_OBSERVATIONS) {
            return;
        }
        if (Math.abs(edge.causalStrength - edge.lastEmittedStrength) < INSIGHT_EMIT_THRESHOLD) {
            return;
        }
        edge.lastEmittedStrength = edge.causalStrength;
        const insight = this.buildInsight(contractId, state, edge, timestamp);
        this.bus.emit(EVENTS.CAUSAL_INSIGHT, insight);
    }
    maybeEmitMarketState(contractId, state, timestamp) {
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
        const nextState = {
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
        this.bus.emit(EVENTS.MARKET_CAUSAL_STATE, nextState);
    }
    buildInsight(contractId, state, edge, timestamp) {
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
    getOrCreateState(contractId) {
        let state = this.states.get(contractId);
        if (state) {
            return state;
        }
        const edges = new Map();
        for (const [cause, effect] of TRACKED_DIRECTIONS) {
            edges.set(edgeKey(cause, effect), this.makeEdge(cause, effect));
        }
        state = {
            recentEvents: new Map(),
            edges,
            latestMarketState: null,
        };
        this.states.set(contractId, state);
        return state;
    }
    materializeEdgeStates(state) {
        const result = [];
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
    getReverseStrength(state, edge) {
        const reverse = state.edges.get(edgeKey(edge.effect, edge.cause));
        return reverse?.causalStrength ?? 0;
    }
    makeEdge(cause, effect) {
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
function buildTrackedDirections() {
    const seen = new Set();
    const result = [];
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
function edgeKey(cause, effect) {
    return `${cause}→${effect}`;
}
function classifyHiddenState(edge) {
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
function shouldEmitState(previous, next) {
    if (!previous) {
        return true;
    }
    if (previous.hiddenState !== next.hiddenState) {
        return true;
    }
    if (previous.topDriver?.cause !== next.topDriver?.cause ||
        previous.topDriver?.effect !== next.topDriver?.effect) {
        return true;
    }
    return (Math.abs(previous.confidence - next.confidence) >= STATE_EMIT_THRESHOLD ||
        Math.abs(previous.instabilityRisk - next.instabilityRisk) >= STATE_EMIT_THRESHOLD ||
        Math.abs(previous.causalEntropy - next.causalEntropy) >= STATE_EMIT_THRESHOLD);
}
function computeEntropy(values) {
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
function mean(values) {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
function latestTimestampForState(state) {
    const values = Array.from(state.recentEvents.values());
    if (values.length === 0) {
        return 1;
    }
    return Math.max(...values);
}
