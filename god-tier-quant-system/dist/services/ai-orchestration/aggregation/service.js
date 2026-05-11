import { EVENTS } from '../../../core/event-bus/events.js';
export class AiAggregationService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
        this.stateTtlMs = 5 * 60 * 1000;
    }
    start() {
        this.bus.on(EVENTS.AI_AGENT_RESPONSE, (event) => {
            this.pruneState(event.timestamp);
            const current = this.state.get(event.contractId) ?? { byAgent: {}, updatedAt: event.timestamp };
            current.byAgent[event.agent] = {
                output: event.output,
                confidence: extractConfidence(event.output),
                timestamp: event.timestamp,
            };
            current.updatedAt = event.timestamp;
            this.state.set(event.contractId, current);
            const aggregate = this.buildAggregate(event.contractId, current.byAgent);
            this.bus.emit(EVENTS.AI_AGGREGATED_INTELLIGENCE, aggregate);
        });
    }
    pruneState(nowMs = Date.now()) {
        const cutoff = nowMs - this.stateTtlMs;
        for (const [contractId, state] of this.state.entries()) {
            if (state.updatedAt < cutoff) {
                this.state.delete(contractId);
            }
        }
    }
    buildAggregate(contractId, byAgent) {
        const market = (byAgent['market-analyst']?.output ?? {});
        const calibration = (byAgent['probability-calibration']?.output ?? {});
        const risk = (byAgent['risk-governor']?.output ?? {});
        const exec = (byAgent['execution-intelligence']?.output ?? {});
        const strategy = (byAgent['strategy-evolution']?.output ?? {});
        const anomaly = (byAgent['anomaly-detection']?.output ?? {});
        const micro = (byAgent['microstructure-intelligence']?.output ?? {});
        const anomalyFlags = [];
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
function extractConfidence(output) {
    if (!output || typeof output !== 'object' || !('confidence' in output)) {
        return 0;
    }
    const value = output.confidence;
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 0;
    }
    return clamp(value, 0, 1);
}
function normalizeWeights(weights) {
    const sanitized = {};
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
    return Object.fromEntries(Object.entries(sanitized).map(([key, value]) => [key, Number((value / total).toFixed(6))]));
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
