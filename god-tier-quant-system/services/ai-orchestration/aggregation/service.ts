import { EventBus } from '../../../core/event-bus/bus.js';
import { EVENTS } from '../../../core/event-bus/events.js';
import { coerceToCanonical, validateCanonicalAIOutput } from '../../../core/ai/canonical-output.js';
import { AgentKind } from '../types.js';

interface ContractAgentState {
  byAgent: Partial<Record<AgentKind, { output: unknown; canonical: ReturnType<typeof coerceToCanonical>; confidence: number; timestamp: number }>>;
  updatedAt: number;
}

export class AiAggregationService {
  private readonly state = new Map<string, ContractAgentState>();
  private readonly stateTtlMs = 5 * 60 * 1000;

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on(
      EVENTS.AI_AGENT_RESPONSE,
      (event: {
        contractId: string;
        agent: AgentKind;
        output: unknown;
        timestamp: number;
      }) => {
        this.pruneState(event.timestamp);

        const current = this.state.get(event.contractId) ?? { byAgent: {}, updatedAt: event.timestamp };

        // Validate against canonical schema; fall back to coercion if invalid.
        const validated = validateCanonicalAIOutput(event.output);
        const canonical = validated.ok ? validated.data : coerceToCanonical(event.output, event.agent);

        // Reject outputs where coercion indicates complete failure (confidence=0, riskLevel=1, BLOCK).
        const isHallucination = canonical.confidence === 0 && canonical.riskLevel === 1
          && canonical.executionRecommendation === 'BLOCK';
        if (isHallucination) {
          this.bus.emit(EVENTS.TELEMETRY, {
            level: 'warn',
            context: 'AiAggregationService',
            message: `agent=${event.agent} output failed canonical validation — suppressed`,
            agent: event.agent,
            contractId: event.contractId,
            timestamp: Date.now(),
          });
          return;
        }

        current.byAgent[event.agent] = {
          output: event.output,
          canonical,
          confidence: canonical.confidence,
          timestamp: event.timestamp,
        };
        current.updatedAt = event.timestamp;
        this.state.set(event.contractId, current);

        const aggregate = this.buildAggregate(event.contractId, current.byAgent);
        this.bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, aggregate);
      },
    );
  }

  private pruneState(nowMs: number = Date.now()): void {
    const cutoff = nowMs - this.stateTtlMs;
    for (const [contractId, state] of this.state.entries()) {
      if (state.updatedAt < cutoff) {
        this.state.delete(contractId);
      }
    }
  }

  private buildAggregate(
    contractId: string,
    byAgent: Partial<Record<AgentKind, { output: unknown; confidence: number; timestamp: number }>>,
  ): {
    contractId: string;
    market_state: { regime: string; narrative: string; observations: string[]; confidence: number };
    probability_adjustment: { recommendedAdjustment: number; calibrationScore: number; overconfidenceDetected: boolean };
    risk_level: { score: number; recommendation: string; confidence: number };
    execution_recommendation: {
      orderStyle: 'market' | 'passive' | 'sliced';
      slices: number;
      timingMs: number;
      expectedSlippage: number;
      fillProbability: number;
      confidence: number;
    };
    anomaly_flags: Array<{ type: string; severity: string; score: number }>;
    strategy_weights: Record<string, number>;
    timestamp: number;
  } {
    const market = (byAgent['market-analyst']?.output ?? {}) as {
      regimeClassification?: string;
      narrative?: string;
      keyObservations?: string[];
    };
    const calibration = (byAgent['probability-calibration']?.output ?? {}) as {
      recommendedAdjustment?: number;
      calibrationScore?: number;
      overconfidenceDetected?: boolean;
    };
    const risk = (byAgent['risk-governor']?.output ?? {}) as { riskLevel?: number; recommendation?: string };
    const exec = (byAgent['execution-intelligence']?.output ?? {}) as {
      orderStyle?: 'market' | 'passive' | 'sliced';
      slices?: number;
      timingMs?: number;
      expectedSlippage?: number;
      fillProbability?: number;
    };
    const strategy = (byAgent['strategy-evolution']?.output ?? {}) as { fitnessScores?: Record<string, number> };
    const anomaly = (byAgent['anomaly-detection']?.output ?? {}) as {
      anomalyType?: string;
      severity?: string;
      anomalyScore?: number;
    };
    const micro = (byAgent['microstructure-intelligence']?.output ?? {}) as {
      manipulationRiskScore?: number;
      liquidityRegime?: string;
    };

    const anomalyFlags: Array<{ type: string; severity: string; score: number }> = [];
    if (typeof anomaly.anomalyType === 'string' && (anomaly.anomalyScore ?? 0) > 10) {
      anomalyFlags.push({
        type: anomaly.anomalyType,
        severity: String(anomaly.severity ?? 'low'),
        score: Number(anomaly.anomalyScore ?? 0),
      });
    }
    if ((micro.manipulationRiskScore ?? 0) >= 70) {
      anomalyFlags.push({
        type: 'microstructure-manipulation-risk',
        severity: 'high',
        score: Number(micro.manipulationRiskScore ?? 0),
      });
    }

    const normalizedStrategyWeights = normalizeWeights(strategy.fitnessScores ?? {});

    return {
      contractId,
      market_state: {
        regime: String(market.regimeClassification ?? micro.liquidityRegime ?? 'unknown'),
        narrative: String(market.narrative ?? ''),
        observations: Array.isArray(market.keyObservations) ? market.keyObservations.map(String) : [],
        confidence: byAgent['market-analyst']?.confidence ?? 0,
      },
      probability_adjustment: {
        recommendedAdjustment: clamp(Number(calibration.recommendedAdjustment ?? 0), -0.2, 0.2),
        calibrationScore: clamp(Number(calibration.calibrationScore ?? 0), 0, 1),
        overconfidenceDetected: Boolean(calibration.overconfidenceDetected),
      },
      risk_level: {
        score: clamp(Number(risk.riskLevel ?? 50), 0, 100),
        recommendation: String(risk.recommendation ?? 'neutral'),
        confidence: byAgent['risk-governor']?.confidence ?? 0,
      },
      execution_recommendation: {
        orderStyle: exec.orderStyle === 'passive' || exec.orderStyle === 'sliced' ? exec.orderStyle : 'market',
        slices: Math.max(1, Math.min(10, Number(exec.slices ?? 1))),
        timingMs: Math.max(0, Math.min(5000, Number(exec.timingMs ?? 0))),
        expectedSlippage: clamp(Number(exec.expectedSlippage ?? 0.01), 0, 1),
        fillProbability: clamp(Number(exec.fillProbability ?? 0.5), 0, 1),
        confidence: byAgent['execution-intelligence']?.confidence ?? 0,
      },
      anomaly_flags: anomalyFlags,
      strategy_weights: normalizedStrategyWeights,
      timestamp: Date.now(),
    };
  }
}

function extractConfidence(output: unknown): number {
  if (!output || typeof output !== 'object' || !('confidence' in output)) {
    return 0;
  }
  const value = (output as { confidence?: unknown }).confidence;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return clamp(value, 0, 1);
}

function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const sanitized: Record<string, number> = {};
  for (const [key, value] of Object.entries(weights)) {
    const numericValue = Math.max(0, Number(value ?? 0));
    if (numericValue > 0) {
      sanitized[key] = numericValue;
    }
  }
  const total = Object.values(sanitized).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(sanitized).map(([key, value]) => [key, Number((value / total).toFixed(6))]),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
