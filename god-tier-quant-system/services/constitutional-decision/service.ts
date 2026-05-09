import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  AggregatedIntelligenceEvent,
  AgentConflict,
  ConstitutionalDecisionEvent,
  DecisionSnapshotEvent,
  DecisionSnapshotInvalidEvent,
  ExecutionControlEvent,
  GovernanceRuleTrace,
  SimulationResult,
  SimulationUniverseEvent,
} from '../../core/schemas/events.js';

interface ContractState {
  snapshot: DecisionSnapshotEvent | null;
  invalid: DecisionSnapshotInvalidEvent | null;
  executionControl: ExecutionControlEvent | null;
  simulation: SimulationUniverseEvent | null;
  sequence: number;
}

interface MutableDecisionState {
  tradeAllowed: boolean;
  executionMode: ConstitutionalDecisionEvent['execution_mode'];
}

export class ConstitutionalDecisionService {
  private readonly byContract = new Map<string, ContractState>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<DecisionSnapshotEvent>(EVENTS.DECISION_SNAPSHOT, (event) => {
      const state = this.getState(event.contractId);
      state.snapshot = event;
    });

    this.bus.on<DecisionSnapshotInvalidEvent>(EVENTS.DECISION_SNAPSHOT_INVALID, (event) => {
      const state = this.getState(event.contractId);
      state.invalid = event;
    });

    this.bus.on<ExecutionControlEvent>(EVENTS.EXECUTION_CONTROL, (event) => {
      const contractId = event.contractId ?? 'KXBTC-DEMO';
      const state = this.getState(contractId);
      state.executionControl = event;
    });

    this.bus.on<SimulationUniverseEvent>(EVENTS.SIMULATION_UNIVERSE, (event) => {
      for (const state of this.byContract.values()) {
        state.simulation = event;
      }
    });

    this.bus.on<AggregatedIntelligenceEvent>(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
      const decision = this.buildDecision(event);
      this.bus.emit(EVENTS.CONSTITUTIONAL_DECISION, decision);
    });
  }

  private buildDecision(ai: AggregatedIntelligenceEvent): ConstitutionalDecisionEvent {
    const state = this.getState(ai.contractId);
    state.sequence += 1;

    const governanceLog: GovernanceRuleTrace[] = [];
    const conflicts: AgentConflict[] = [];

    const decisionState: MutableDecisionState = {
      tradeAllowed: true,
      executionMode: ai.execution_recommendation.orderStyle === 'market' ? 'market' : 'passive',
    };

    const snapshot = state.snapshot;
    const now = Date.now();

    this.applySnapshotRules(snapshot, state.invalid, governanceLog, decisionState);
    this.applyHardRiskRule(state.executionControl, governanceLog, decisionState);

    const riskLevel = clamp(ai.risk_level.score, 0, 100);
    this.applyRiskScoreRule(riskLevel, governanceLog, decisionState);

    const regime = ai.market_state.regime;
    const lowLiquidity = regime.includes('low-liquidity') || regime.includes('thin');
    this.applyLiquidityRule(lowLiquidity, governanceLog, conflicts, decisionState);

    const highAnomaly = ai.anomaly_flags.some((flag) => flag.severity === 'high' || flag.score >= 70);
    this.applyAnomalyRule(highAnomaly, governanceLog, conflicts, decisionState);

    if (ai.risk_level.recommendation === 'de-risk' && ai.execution_recommendation.orderStyle === 'market') {
      conflicts.push({
        category: 'risk-vs-execution',
        severity: 'medium',
        detail: 'risk recommends de-risk while execution recommendation is market',
      });
    }

    const snapshotProbability = snapshot ? snapshot.state.probability.estimatedProbability : 0.5;
    const marketImplied = snapshot ? snapshot.state.probability.marketImpliedProbability : 0.5;
    const adjustment = clamp(ai.probability_adjustment.recommendedAdjustment, -0.2, 0.2);
    let finalProbability = clamp(snapshotProbability + adjustment, 0.01, 0.99);

    let confidenceScore = clamp(
      (ai.market_state.confidence * 0.45 + ai.risk_level.confidence * 0.35 + ai.execution_recommendation.confidence * 0.2),
      0,
      1,
    );
    if (ai.probability_adjustment.overconfidenceDetected) {
      confidenceScore = clamp(confidenceScore * 0.72, 0, 1);
      governanceLog.push(this.rule('overconfidence-clamp', 'adjust', 'confidence reduced due to overconfidence signal'));
    } else {
      governanceLog.push(this.rule('overconfidence-clamp', 'pass', 'no overconfidence clamp required'));
    }

    const sim = state.simulation;
    const simulationResult: SimulationResult = {
      passed: true,
      divergenceScore: 0,
      scenarioCount: sim?.scenarioCount ?? 0,
      tailProbability: clamp(sim?.tailProbability ?? 0.1, 0, 1),
      worstCasePnl: sim?.worstCasePnl ?? 0,
      reason: 'simulation-ok',
    };
    const divergenceScore = clamp(Math.abs(simulationResult.worstCasePnl) / 200, 0, 1);
    simulationResult.divergenceScore = divergenceScore;
    if (divergenceScore > 0.6 || simulationResult.tailProbability > 0.45) {
      simulationResult.passed = false;
      simulationResult.reason = 'simulation-divergence-threshold';
      governanceLog.push(this.rule('simulation-gate', 'block', simulationResult.reason));
      decisionState.tradeAllowed = false;
      decisionState.executionMode = 'blocked';
    } else {
      governanceLog.push(this.rule('simulation-gate', 'pass', 'simulation within threshold'));
    }

    if (!decisionState.tradeAllowed) {
      finalProbability = clamp((finalProbability + marketImplied) / 2, 0.01, 0.99);
    }

    if (riskLevel >= 70 && finalProbability > 0.55) {
      conflicts.push({
        category: 'risk-vs-direction',
        severity: 'medium',
        detail: 'bullish probability under elevated risk regime',
      });
    }

    const edgeScore = Number((finalProbability - marketImplied).toFixed(6));

    const decision: ConstitutionalDecisionEvent = {
      cycle_id: `${ai.contractId}:${state.sequence}:${now}`,
      snapshot_id: snapshot?.snapshot_id ?? `missing:${ai.contractId}`,
      market_state_hash: snapshot?.market_state_hash ?? 'missing',
      contractId: ai.contractId,
      trade_allowed: decisionState.tradeAllowed,
      final_probability: finalProbability,
      edge_score: edgeScore,
      risk_level: riskLevel,
      execution_mode: decisionState.tradeAllowed ? decisionState.executionMode : 'blocked',
      regime_state: ai.market_state.regime,
      confidence_score: Number(confidenceScore.toFixed(6)),
      simulation_result: simulationResult,
      governance_log: governanceLog,
      agent_conflicts: conflicts,
      agent_consensus: {
        market_confidence: ai.market_state.confidence,
        risk_confidence: ai.risk_level.confidence,
        execution_confidence: ai.execution_recommendation.confidence,
        calibration_score: ai.probability_adjustment.calibrationScore,
      },
      timestamp: now,
    };

    return decision;
  }

  private applySnapshotRules(
    snapshot: DecisionSnapshotEvent | null,
    invalid: DecisionSnapshotInvalidEvent | null,
    governanceLog: GovernanceRuleTrace[],
    decisionState: MutableDecisionState,
  ): void {
    if (snapshot) {
      governanceLog.push(this.rule('snapshot-required', 'pass', `snapshot=${snapshot.snapshot_id}`));
    } else {
      governanceLog.push(this.rule('snapshot-required', 'block', 'missing synchronized snapshot'));
      decisionState.tradeAllowed = false;
      decisionState.executionMode = 'blocked';
    }

    if (snapshot && invalid && invalid.timestamp >= snapshot.timestamp) {
      governanceLog.push(this.rule('snapshot-validity', 'block', `invalid cycle: ${invalid.reason}`));
      decisionState.tradeAllowed = false;
      decisionState.executionMode = 'blocked';
      return;
    }
    governanceLog.push(this.rule('snapshot-validity', 'pass', 'no invalid cycle newer than snapshot'));
  }

  private applyHardRiskRule(
    control: ExecutionControlEvent | null,
    governanceLog: GovernanceRuleTrace[],
    decisionState: MutableDecisionState,
  ): void {
    if (control?.mode === 'hard-stop') {
      governanceLog.push(this.rule('hard-risk-veto', 'block', `execution control=${control.reason}`));
      decisionState.tradeAllowed = false;
      decisionState.executionMode = 'blocked';
      return;
    }
    governanceLog.push(this.rule('hard-risk-veto', 'pass', `execution control=${control?.mode ?? 'normal'}`));
  }

  private applyRiskScoreRule(
    riskLevel: number,
    governanceLog: GovernanceRuleTrace[],
    decisionState: MutableDecisionState,
  ): void {
    if (riskLevel >= 85) {
      governanceLog.push(this.rule('risk-score-threshold', 'block', `risk=${riskLevel}`));
      decisionState.tradeAllowed = false;
      decisionState.executionMode = 'blocked';
      return;
    }
    governanceLog.push(this.rule('risk-score-threshold', 'pass', `risk=${riskLevel}`));
  }

  private applyLiquidityRule(
    lowLiquidity: boolean,
    governanceLog: GovernanceRuleTrace[],
    conflicts: AgentConflict[],
    decisionState: MutableDecisionState,
  ): void {
    if (lowLiquidity && decisionState.executionMode === 'market') {
      governanceLog.push(this.rule('liquidity-execution-override', 'adjust', 'forced passive due to low liquidity regime'));
      decisionState.executionMode = 'passive';
      conflicts.push({
        category: 'liquidity-vs-execution',
        severity: 'medium',
        detail: 'market execution overridden to passive under low liquidity regime',
      });
      return;
    }
    governanceLog.push(this.rule('liquidity-execution-override', 'pass', 'no liquidity execution override'));
  }

  private applyAnomalyRule(
    highAnomaly: boolean,
    governanceLog: GovernanceRuleTrace[],
    conflicts: AgentConflict[],
    decisionState: MutableDecisionState,
  ): void {
    if (highAnomaly) {
      governanceLog.push(this.rule('anomaly-veto', 'block', 'high anomaly severity/score detected'));
      decisionState.tradeAllowed = false;
      decisionState.executionMode = 'blocked';
      conflicts.push({
        category: 'anomaly-vs-trade',
        severity: 'high',
        detail: 'trade blocked by anomaly veto',
      });
      return;
    }
    governanceLog.push(this.rule('anomaly-veto', 'pass', 'no high anomaly veto'));
  }

  private getState(contractId: string): ContractState {
    const current = this.byContract.get(contractId);
    if (current) {
      return current;
    }
    const state: ContractState = {
      snapshot: null,
      invalid: null,
      executionControl: null,
      simulation: null,
      sequence: 0,
    };
    this.byContract.set(contractId, state);
    return state;
  }

  private rule(rule: string, outcome: GovernanceRuleTrace['outcome'], detail: string): GovernanceRuleTrace {
    return {
      rule,
      outcome,
      detail,
      timestamp: Date.now(),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
