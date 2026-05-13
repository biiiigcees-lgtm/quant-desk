import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  AggregatedSignal,
  ExecutionPathMirrorEvent,
  ExecutionPlan,
  MarketPhysicsEvent,
  ScenarioBranchStateEvent,
  SimulationUniverseEvent,
  StrategySignal,
  ValidationResultEvent,
} from '../../core/schemas/events.js';

// Candidate plan profiles used to generate alternative execution paths.
const CANDIDATE_PROFILES = ['market-aggressive', 'passive-patient', 'sliced-vwap', 'reduced-half'] as const;
type CandidateProfile = (typeof CANDIDATE_PROFILES)[number];

interface CandidatePlan {
  style: 'market' | 'passive' | 'sliced';
  slices: number;
  sizeFraction: number;
  expectedSlippage: number;
  fillProbability: number;
  latencyBudgetMs: number;
}

const CANDIDATE_SPECS: Record<CandidateProfile, CandidatePlan> = {
  'market-aggressive': { style: 'market', slices: 1, sizeFraction: 1, expectedSlippage: 0.004, fillProbability: 0.97, latencyBudgetMs: 60 },
  'passive-patient':   { style: 'passive', slices: 1, sizeFraction: 1, expectedSlippage: 0.001, fillProbability: 0.72, latencyBudgetMs: 110 },
  'sliced-vwap':       { style: 'sliced', slices: 4, sizeFraction: 1, expectedSlippage: 0.002, fillProbability: 0.88, latencyBudgetMs: 80 },
  'reduced-half':      { style: 'passive', slices: 1, sizeFraction: 0.5, expectedSlippage: 0.001, fillProbability: 0.8, latencyBudgetMs: 110 },
};

export class SimulationUniverseService {
  private readonly latestPlan: Map<string, ExecutionPlan> = new Map();
  private readonly latestPhysics: Map<string, MarketPhysicsEvent> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<ExecutionPlan>(EVENTS.EXECUTION_PLAN, (plan) => {
      this.latestPlan.set(plan.contractId, plan);
    });

    this.bus.on<MarketPhysicsEvent>(EVENTS.MARKET_PHYSICS, (event) => {
      this.latestPhysics.set(event.contractId, event);
    });

    this.bus.on<StrategySignal>(EVENTS.STRATEGY_SIGNAL, (signal) => {
      const walkForwardScore = Number((signal.confidence * 100 - Math.abs(signal.expectedValue) * 40).toFixed(2));
      let walkForwardStatus: ValidationResultEvent['status'];
      if (walkForwardScore >= 45 && signal.confidence >= 0.55) {
        walkForwardStatus = 'pass';
      } else if (walkForwardScore >= 25) {
        walkForwardStatus = 'hold';
      } else {
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
      } satisfies ValidationResultEvent);

      let adversarialPenalty: number;
      if (signal.regime === 'panic') {
        adversarialPenalty = 30;
      } else if (signal.regime === 'low-liquidity') {
        adversarialPenalty = 18;
      } else {
        adversarialPenalty = 8;
      }
      const adversarialScore = Number((signal.confidence * 100 - adversarialPenalty).toFixed(2));
      let adversarialStatus: ValidationResultEvent['status'];
      if (adversarialScore >= 40 && signal.expectedValue > 0.01) {
        adversarialStatus = 'pass';
      } else if (adversarialScore >= 20) {
        adversarialStatus = 'hold';
      } else {
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
      } satisfies ValidationResultEvent);
    });

    this.bus.on<AggregatedSignal>(EVENTS.AGGREGATED_SIGNAL, (event) => {
      const physics = this.latestPhysics.get(event.contractId);
      const scenarioCount = 256;
      const tailProbability = Number(
        clamp(
          Math.max(0.01, 1 - event.agreement) * 0.7 + (physics?.structuralStress ?? 0.25) * 0.3,
          0.01,
          0.99,
        ).toFixed(4),
      );
      const worstCasePnl = Number((-Math.abs(event.score) * 220 * tailProbability).toFixed(2));

      const branchScores = buildBranchScores(event, physics);
      const dominantBranch = Object.entries(branchScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'balanced-range';
      const volatilityWeight = clamp(tailProbability * 0.7 + (physics?.entropyExpansion ?? 0.2) * 0.3, 0, 1);
      const invalidated = volatilityWeight > 0.78 || Math.abs(worstCasePnl) > 55;

      const branchEvent: ScenarioBranchStateEvent = {
        contractId: event.contractId,
        invalidated,
        branchScores,
        dominantBranch,
        volatilityWeight: Number(volatilityWeight.toFixed(4)),
        timestamp: event.timestamp,
      };

      this.bus.emit<ScenarioBranchStateEvent>(EVENTS.SCENARIO_BRANCH_STATE, branchEvent);

      const { candidateDivergences, bestCandidatePlan, klDivergence, mirrorConfidence } =
        this.computeExecutionPathMirror(event.contractId, event.timestamp);

      const payload: SimulationUniverseEvent = {
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

  private computeExecutionPathMirror(
    contractId: string,
    timestamp: number,
  ): {
    candidateDivergences: Record<string, number>;
    bestCandidatePlan: string;
    klDivergence: number;
    mirrorConfidence: number;
  } {
    const actual = this.latestPlan.get(contractId);

    // If no actual plan has arrived yet, return neutral defaults.
    if (!actual) {
      const uniform = Object.fromEntries(CANDIDATE_PROFILES.map((k) => [k, 0.25]));
      return { candidateDivergences: uniform, bestCandidatePlan: 'sliced-vwap', klDivergence: 0.25, mirrorConfidence: 0 };
    }

    const candidateDivergences: Record<string, number> = {};
    let minDivergence = Infinity;
    let bestCandidatePlan: CandidateProfile = 'sliced-vwap';

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
    const klDivergence = Number(
      (Object.values(candidateDivergences).reduce((a, b) => a + b, 0) / CANDIDATE_PROFILES.length).toFixed(4),
    );

    // Emit the dedicated mirror event for downstream monitoring.
    const mirrorEvent: ExecutionPathMirrorEvent = {
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
  private klDivergencePlans(actual: ExecutionPlan, candidate: CandidatePlan): number {
    const p1 = Math.max(0.01, Math.min(0.99, actual.fillProbability));
    const p2 = Math.max(0.01, Math.min(0.99, candidate.fillProbability));
    const q1 = 1 - p1;
    const q2 = 1 - p2;

    const klPQ = p1 * Math.log(p1 / p2) + q1 * Math.log(q1 / q2);
    const klQP = p2 * Math.log(p2 / p1) + q2 * Math.log(q2 / q1);
    const symmetricKl = (klPQ + klQP) / 2;

    // Add a style mismatch penalty.
    const styleMismatch = actual.orderStyle === candidate.style ? 0 : 0.15;

    return Math.max(0, symmetricKl + styleMismatch);
  }
}

function buildBranchScores(
  signal: AggregatedSignal,
  physics?: MarketPhysicsEvent,
): Record<string, number> {
  const score = clamp(Math.abs(signal.score), 0, 1);
  const agreement = clamp(signal.agreement, 0, 1);
  const structuralStress = physics?.structuralStress ?? 0.25;
  const compression = physics?.compression ?? 0.45;
  const expansion = physics?.expansion ?? 0.4;

  return {
    'trend-continuation': Number(clamp(score * 0.5 + agreement * 0.35 + expansion * 0.15 - structuralStress * 0.2, 0, 1).toFixed(4)),
    'mean-reversion': Number(clamp((1 - agreement) * 0.35 + compression * 0.4 + structuralStress * 0.25, 0, 1).toFixed(4)),
    'liquidity-shock': Number(clamp(structuralStress * 0.55 + (physics?.entropyExpansion ?? 0.2) * 0.3 + (1 - compression) * 0.15, 0, 1).toFixed(4)),
    'balanced-range': Number(clamp((1 - Math.abs(score - 0.5)) * 0.4 + compression * 0.3 + (1 - structuralStress) * 0.3, 0, 1).toFixed(4)),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
