import { EVENTS } from '../../core/event-bus/events.js';
// Candidate plan profiles used to generate alternative execution paths.
const CANDIDATE_PROFILES = ['market-aggressive', 'passive-patient', 'sliced-vwap', 'reduced-half'];
const CANDIDATE_SPECS = {
    'market-aggressive': { style: 'market', slices: 1, sizeFraction: 1.0, expectedSlippage: 0.004, fillProbability: 0.97, latencyBudgetMs: 60 },
    'passive-patient': { style: 'passive', slices: 1, sizeFraction: 1.0, expectedSlippage: 0.001, fillProbability: 0.72, latencyBudgetMs: 110 },
    'sliced-vwap': { style: 'sliced', slices: 4, sizeFraction: 1.0, expectedSlippage: 0.002, fillProbability: 0.88, latencyBudgetMs: 80 },
    'reduced-half': { style: 'passive', slices: 1, sizeFraction: 0.5, expectedSlippage: 0.001, fillProbability: 0.80, latencyBudgetMs: 110 },
};
export class SimulationUniverseService {
    constructor(bus) {
        this.bus = bus;
        this.latestPlan = new Map();
    }
    start() {
        this.bus.on(EVENTS.EXECUTION_PLAN, (plan) => {
            this.latestPlan.set(plan.contractId, plan);
        });
        this.bus.on(EVENTS.STRATEGY_SIGNAL, (signal) => {
            const walkForwardScore = Number((signal.confidence * 100 - Math.abs(signal.expectedValue) * 40).toFixed(2));
            let walkForwardStatus;
            if (walkForwardScore >= 45 && signal.confidence >= 0.55) {
                walkForwardStatus = 'pass';
            }
            else if (walkForwardScore >= 25) {
                walkForwardStatus = 'hold';
            }
            else {
                walkForwardStatus = 'fail';
            }
            this.bus.emit(EVENTS.VALIDATION_RESULT, {
                contractId: signal.contractId,
                strategyId: signal.strategyId,
                kind: 'walk-forward',
                status: walkForwardStatus,
                score: walkForwardScore,
                details: `confidence=${signal.confidence.toFixed(3)} expectedValue=${signal.expectedValue.toFixed(4)}`,
                timestamp: signal.timestamp,
            });
            let adversarialPenalty;
            if (signal.regime === 'panic') {
                adversarialPenalty = 30;
            }
            else if (signal.regime === 'low-liquidity') {
                adversarialPenalty = 18;
            }
            else {
                adversarialPenalty = 8;
            }
            const adversarialScore = Number((signal.confidence * 100 - adversarialPenalty).toFixed(2));
            let adversarialStatus;
            if (adversarialScore >= 40 && signal.expectedValue > 0.01) {
                adversarialStatus = 'pass';
            }
            else if (adversarialScore >= 20) {
                adversarialStatus = 'hold';
            }
            else {
                adversarialStatus = 'fail';
            }
            this.bus.emit(EVENTS.VALIDATION_RESULT, {
                contractId: signal.contractId,
                strategyId: signal.strategyId,
                kind: 'adversarial',
                status: adversarialStatus,
                score: adversarialScore,
                details: `regime=${signal.regime} penalty=${adversarialPenalty}`,
                timestamp: signal.timestamp,
            });
        });
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, (event) => {
            const scenarioCount = 256;
            const tailProbability = Number(Math.max(0.01, 1 - event.agreement).toFixed(4));
            const worstCasePnl = Number((-Math.abs(event.score) * 220 * tailProbability).toFixed(2));
            const { candidateDivergences, bestCandidatePlan, klDivergence, mirrorConfidence } = this.computeExecutionPathMirror(event.contractId, event.timestamp);
            const payload = {
                scenarioCount,
                worstCasePnl,
                tailProbability,
                executionPathDivergence: klDivergence,
                candidateDivergences,
                bestCandidatePlan,
                mirrorConfidence,
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.SIMULATION_UNIVERSE, payload);
        });
    }
    computeExecutionPathMirror(contractId, timestamp) {
        const actual = this.latestPlan.get(contractId);
        // If no actual plan has arrived yet, return neutral defaults.
        if (!actual) {
            const uniform = Object.fromEntries(CANDIDATE_PROFILES.map((k) => [k, 0.25]));
            return { candidateDivergences: uniform, bestCandidatePlan: 'sliced-vwap', klDivergence: 0.25, mirrorConfidence: 0.0 };
        }
        const candidateDivergences = {};
        let minDivergence = Infinity;
        let bestCandidatePlan = 'sliced-vwap';
        for (const profile of CANDIDATE_PROFILES) {
            const spec = CANDIDATE_SPECS[profile];
            const div = this.klDivergencePlans(actual, spec);
            candidateDivergences[profile] = Number(div.toFixed(4));
            if (div < minDivergence) {
                minDivergence = div;
                bestCandidatePlan = profile;
            }
        }
        // Mirror confidence: how well does our pre-trade model match the actual plan?
        // Confidence is higher when the actual plan closely resembles at least one candidate.
        const mirrorConfidence = Number(Math.max(0, 1 - minDivergence).toFixed(4));
        // KL divergence of actual plan vs. the uniform-mix of all candidates.
        const klDivergence = Number((Object.values(candidateDivergences).reduce((a, b) => a + b, 0) / CANDIDATE_PROFILES.length).toFixed(4));
        // Emit the dedicated mirror event for downstream monitoring.
        const mirrorEvent = {
            contractId,
            actualStyle: actual.orderStyle,
            candidateDivergences,
            bestCandidatePlan,
            klDivergence,
            timestamp,
        };
        this.bus.emit(EVENTS.EXECUTION_PATH_MIRROR, mirrorEvent);
        return { candidateDivergences, bestCandidatePlan, klDivergence, mirrorConfidence };
    }
    // Simplified symmetric KL divergence between actual plan and a candidate spec.
    // Uses fill probability and normalised slippage as the distribution parameters.
    klDivergencePlans(actual, candidate) {
        const p1 = Math.max(0.01, Math.min(0.99, actual.fillProbability));
        const p2 = Math.max(0.01, Math.min(0.99, candidate.fillProbability));
        const q1 = 1 - p1;
        const q2 = 1 - p2;
        const klPQ = p1 * Math.log(p1 / p2) + q1 * Math.log(q1 / q2);
        const klQP = p2 * Math.log(p2 / p1) + q2 * Math.log(q2 / q1);
        const symmetricKl = (klPQ + klQP) / 2;
        // Add a style mismatch penalty.
        const styleMismatch = actual.orderStyle !== candidate.style ? 0.15 : 0;
        return Math.max(0, symmetricKl + styleMismatch);
    }
}
