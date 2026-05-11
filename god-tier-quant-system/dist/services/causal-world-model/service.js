import { EVENTS } from '../../core/event-bus/events.js';
// Time window within which event B is considered caused by event A (ms).
const CAUSAL_WINDOW_MS = 500;
// Minimum observations before reporting causal strength.
const MIN_OBSERVATIONS = 4;
// Minimum change in causal strength to emit a new insight.
const EMIT_THRESHOLD = 0.05;
// Causal pairs to track: [cause event, effect event, contract-aware?]
// contract-aware = true means we only credit the transition if both events share a contractId.
const TRACKED_PAIRS = [
    [EVENTS.MICROSTRUCTURE, EVENTS.PROBABILITY],
    [EVENTS.DRIFT_EVENT, EVENTS.CALIBRATION_UPDATE],
    [EVENTS.ANOMALY, EVENTS.EXECUTION_CONTROL],
    [EVENTS.PROBABILITY, EVENTS.STRATEGY_SIGNAL],
];
export class CausalWorldModelService {
    constructor(bus) {
        this.bus = bus;
        // key: `${cause}→${effect}`
        this.edges = new Map();
        // key: event type → most recent timestamp of that event per contractId
        this.recentEvents = new Map();
        for (const [cause, effect] of TRACKED_PAIRS) {
            const key = `${cause}→${effect}`;
            const reverseKey = `${effect}→${cause}`;
            if (!this.edges.has(key)) {
                this.edges.set(key, this.makeEdge(cause, effect));
            }
            if (!this.edges.has(reverseKey)) {
                this.edges.set(reverseKey, this.makeEdge(effect, cause));
            }
        }
    }
    start() {
        const allTracked = new Set();
        for (const [c, e] of TRACKED_PAIRS) {
            allTracked.add(c);
            allTracked.add(e);
        }
        for (const eventType of allTracked) {
            this.bus.on(eventType, (event) => {
                this.onEvent(eventType, event.contractId ?? 'global', event.timestamp);
            });
        }
    }
    getLatestInsights() {
        const result = [];
        for (const [, edge] of this.edges) {
            if (edge.opportunities >= MIN_OBSERVATIONS) {
                result.push(this.buildInsight(edge));
            }
        }
        return result;
    }
    onEvent(eventType, contractId, timestamp) {
        // Record this event as a potential effect of earlier events.
        for (const [cause, effect] of TRACKED_PAIRS) {
            if (eventType === effect) {
                const causeKey = `${contractId}:${cause}`;
                const causeTs = this.recentEvents.get(causeKey) ?? 0;
                if (causeTs > 0 && timestamp - causeTs <= CAUSAL_WINDOW_MS) {
                    this.increment(`${cause}→${effect}`, true);
                }
                // Track reverse (effect appeared, now watch if cause also follows — spurious check)
                const reverseKey = `${contractId}:${effect}`;
                const reverseTs = this.recentEvents.get(reverseKey) ?? 0;
                if (reverseTs > 0 && timestamp - reverseTs <= CAUSAL_WINDOW_MS) {
                    this.increment(`${effect}→${cause}`, true);
                }
                this.increment(`${cause}→${effect}`, false);
            }
            if (eventType === cause) {
                this.increment(`${effect}→${cause}`, false);
            }
        }
        // Register this event as a recent occurrence for future transition checks.
        this.recentEvents.set(`${contractId}:${eventType}`, timestamp);
    }
    increment(key, isTransition) {
        const edge = this.edges.get(key);
        if (!edge)
            return;
        if (isTransition) {
            edge.transitions += 1;
        }
        else {
            edge.opportunities += 1;
        }
        this.recalculate(edge);
        this.maybeEmit(edge);
    }
    recalculate(edge) {
        edge.causalStrength = edge.opportunities > 0
            ? Number((edge.transitions / edge.opportunities).toFixed(4))
            : 0;
        // Spurious if the reverse direction is almost as strong (within 15%).
        edge.spurious = edge.reverseStrength >= edge.causalStrength * 0.85 && edge.causalStrength > 0.1;
    }
    maybeEmit(edge) {
        if (edge.opportunities < MIN_OBSERVATIONS)
            return;
        if (Math.abs(edge.causalStrength - edge.lastEmittedStrength) < EMIT_THRESHOLD)
            return;
        edge.lastEmittedStrength = edge.causalStrength;
        const insight = this.buildInsight(edge);
        this.bus.emit(EVENTS.CAUSAL_INSIGHT, insight);
    }
    buildInsight(edge) {
        return {
            contractId: 'global',
            cause: edge.cause,
            effect: edge.effect,
            causalStrength: edge.causalStrength,
            reverseStrength: edge.reverseStrength,
            confidence: Number(Math.max(0, 1 - edge.reverseStrength).toFixed(4)),
            spurious: edge.spurious,
            timestamp: Date.now(),
        };
    }
    makeEdge(cause, effect) {
        return {
            cause, effect,
            opportunities: 0, transitions: 0,
            reverseOpportunities: 0, reverseTransitions: 0,
            causalStrength: 0, reverseStrength: 0,
            spurious: false, lastEmittedStrength: -1,
        };
    }
}
