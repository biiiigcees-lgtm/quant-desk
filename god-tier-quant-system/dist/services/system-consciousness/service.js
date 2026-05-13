import { EVENTS } from '../../core/event-bus/events.js';
export class SystemConsciousnessService {
    constructor(bus, options = { epistemicFloor: 0.35 }) {
        this.bus = bus;
        this.options = options;
        this.latestBelief = null;
        this.latestSystemBelief = null;
        this.latestDecision = null;
        this.latestCalibration = null;
        this.latestDrift = null;
        this.latestMetaCalibration = null;
        this.latestAttention = null;
        this.latestMarketExperience = null;
    }
    start() {
        this.bus.on(EVENTS.BELIEF_GRAPH_STATE, (event) => {
            this.latestBelief = event;
            this.publish();
        });
        this.bus.on(EVENTS.SYSTEM_BELIEF_STATE, (event) => {
            this.latestSystemBelief = event;
            this.publish();
        });
        this.bus.on(EVENTS.CONSTITUTIONAL_DECISION, (event) => {
            this.latestDecision = event;
            this.publish();
        });
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            this.latestCalibration = event;
            this.publish();
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            this.latestDrift = event;
            this.publish();
        });
        this.bus.on(EVENTS.META_CALIBRATION, (event) => {
            this.latestMetaCalibration = event;
            this.publish();
        });
        this.bus.on(EVENTS.OPERATOR_ATTENTION, (event) => {
            this.latestAttention = event;
            this.publish();
        });
        this.bus.on(EVENTS.MARKET_EXPERIENCE, (event) => {
            this.latestMarketExperience = event;
            this.publish();
        });
    }
    publish() {
        if (!this.latestDecision || (!this.latestBelief && !this.latestSystemBelief)) {
            return;
        }
        const topology = this.latestSystemBelief
            ? topologyFromSystemBelief(this.latestSystemBelief)
            : topologyFromBeliefGraph(this.latestBelief);
        const top = topology.topHypotheses;
        const contradictionDensity = topology.contradictionDensity;
        const uncertaintyTopology = topology.uncertaintyTopology;
        const driftStress = this.latestDrift ? clamp(Math.max(this.latestDrift.psi, this.latestDrift.kl), 0, 1) : 0;
        const calibrationStress = this.latestCalibration ? clamp(this.latestCalibration.ece, 0, 1) : 0;
        const contradictionStress = topology.contradictionStress;
        const aggregateStress = clamp(0.35 * contradictionStress + 0.35 * calibrationStress + 0.3 * driftStress, 0, 1);
        const authorityDecay = this.latestMetaCalibration?.authorityDecay ?? 0;
        const attentionDensity = this.latestAttention?.density ?? 0;
        const traumaPenalty = this.latestMarketExperience?.traumaPenalty ?? 0;
        const trustDecay = clamp(0.45 * aggregateStress + 0.3 * authorityDecay + 0.15 * traumaPenalty + 0.1 * attentionDensity, 0, 1);
        const selfTrustScore = clamp(1 - trustDecay, 0, 1);
        const executionConfidence = clamp(this.latestDecision.confidence_score * (1 - uncertaintyTopology) * (1 - aggregateStress * 0.5) * selfTrustScore, 0, 1);
        const invalidationPath = buildInvalidationPath({
            stress: aggregateStress,
            contradictionDensity,
            tradeAllowed: this.latestDecision.trade_allowed,
            epistemicFloor: this.options.epistemicFloor,
            trustDecay,
        });
        const contradictions = topology.contradictions;
        const cognitiveStressState = cognitiveStressFromAggregate(Math.max(aggregateStress, trustDecay));
        const timestamp = maxTimestamp([
            this.latestBelief?.timestamp,
            this.latestSystemBelief?.timestamp,
            this.latestDecision.timestamp,
            this.latestCalibration?.timestamp,
            this.latestDrift?.timestamp,
            this.latestMetaCalibration?.timestamp,
            this.latestAttention?.timestamp,
            this.latestMarketExperience?.timestamp,
        ]);
        const consciousness = {
            contractId: this.latestDecision.contractId,
            cycleId: this.latestDecision.cycle_id,
            snapshotId: this.latestDecision.snapshot_id,
            beliefTopology: {
                topHypotheses: top,
                contradictionCount: topology.contradictionCount,
                contradictionDensity,
                uncertaintyTopology,
            },
            epistemicStress: {
                driftStress,
                calibrationStress,
                contradictionStress,
                aggregate: aggregateStress,
            },
            executionConfidence,
            contradictions,
            contradictionDensity,
            cognitiveStressState,
            selfTrustScore,
            trustDecay,
            invalidationPath,
            timestamp,
        };
        const status = healthStatusFromAggregate(Math.max(aggregateStress, trustDecay));
        const score = clamp(1 - Math.max(aggregateStress, trustDecay), 0, 1);
        const health = {
            contractId: this.latestDecision.contractId,
            score,
            status,
            components: {
                contradiction: contradictionStress,
                calibration: calibrationStress,
                drift: driftStress,
                anomaly: clamp(uncertaintyTopology, 0, 1),
            },
            epistemicHealthScore: score,
            calibrationHealth: clamp(1 - calibrationStress, 0, 1),
            driftHealth: clamp(1 - driftStress, 0, 1),
            anomalyHealth: clamp(1 - uncertaintyTopology, 0, 1),
            stabilityHealth: clamp(1 - contradictionStress, 0, 1),
            metaCalibrationScore: this.latestMetaCalibration?.compositeScore,
            healthGrade: healthGradeFromScore(score),
            timestamp: consciousness.timestamp,
        };
        this.bus.emit(EVENTS.SYSTEM_CONSCIOUSNESS, consciousness);
        this.bus.emit(EVENTS.EPISTEMIC_HEALTH, health);
        this.bus.emit(EVENTS.TELEMETRY, {
            name: 'organism.epistemic.health',
            value: health.score,
            tags: { status: health.status, contractId: health.contractId },
            timestamp: health.timestamp,
        });
    }
}
function topologyFromBeliefGraph(belief) {
    const topHypotheses = belief.summary.topHypotheses.slice(0, 3).map((item) => ({
        nodeId: item.nodeId,
        evidence: item.evidence,
        uncertainty: item.uncertainty,
    }));
    const contradictionCount = belief.summary.contradictionCount;
    const contradictionDensity = clamp(contradictionCount / Math.max(1, belief.summary.topHypotheses.length), 0, 1);
    return {
        topHypotheses,
        contradictionCount,
        contradictionDensity,
        uncertaintyTopology: clamp(belief.summary.graphEntropy, 0, 1),
        contradictionStress: clamp(belief.summary.maxContradictionStrength, 0, 1),
        contradictions: belief.summary.contradictions.map((item) => ({
            source: item.hypothesis1,
            target: item.hypothesis2,
            severity: contradictionSeverity(item.conflictStrength),
            detail: item.conflictReason,
        })),
    };
}
function topologyFromSystemBelief(belief) {
    const signal = belief.belief;
    const topHypotheses = [
        {
            nodeId: `regime:${signal.regimeHypothesis.type}`,
            evidence: signal.regimeHypothesis.probability,
            uncertainty: 1 - signal.regimeHypothesis.stability,
        },
        {
            nodeId: `bias:${signal.directionalBiasModel.bias}`,
            evidence: signal.directionalBiasModel.strength,
            uncertainty: 1 - signal.directionalBiasModel.persistence,
        },
        {
            nodeId: `liquidity:${signal.structuralMarketState.liquidityCondition}`,
            evidence: 1 - signal.structuralMarketState.manipulationRisk,
            uncertainty: signal.structuralMarketState.manipulationRisk,
        },
    ];
    const contradictionStress = clamp(signal.structuralMarketState.manipulationRisk * 0.5 + signal.selfAssessment.calibrationDrift * 0.5, 0, 1);
    const isHighContradiction = contradictionStress > 0.66;
    const isMediumContradiction = contradictionStress > 0.4;
    const contradictionCount = isHighContradiction ? 2 : (isMediumContradiction ? 1 : 0);
    const contradictionDensity = clamp(contradictionCount / topHypotheses.length, 0, 1);
    const contradictions = contradictionCount > 0
        ? [
            {
                source: `bias:${signal.directionalBiasModel.bias}`,
                target: `structure:${signal.structuralMarketState.volatilityRegime}`,
                severity: contradictionSeverity(contradictionStress),
                detail: `bias persistence=${signal.directionalBiasModel.persistence.toFixed(2)} vs manipulation=${signal.structuralMarketState.manipulationRisk.toFixed(2)}`,
            },
        ]
        : [];
    return {
        topHypotheses,
        contradictionCount,
        contradictionDensity,
        uncertaintyTopology: clamp(signal.behavioralExpectation.expectedVolatility * 0.55 + signal.selfAssessment.calibrationDrift * 0.45, 0, 1),
        contradictionStress,
        contradictions,
    };
}
function buildInvalidationPath(input) {
    if (!input.tradeAllowed) {
        return 'Constitutional decision blocks execution; await governance pass.';
    }
    if (input.trustDecay > 0.72) {
        return 'Self-trust degraded; trigger authority decay containment and recalibration cycle.';
    }
    if (input.stress > 1 - input.epistemicFloor) {
        return 'Epistemic stress breached floor; require recalibration and fresh snapshot.';
    }
    if (input.contradictionDensity > 0.55) {
        return 'Contradiction density too high; force adversarial review cycle.';
    }
    return 'Invalidate on drift escalation, contradiction growth, or confidence floor breach.';
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
function contradictionSeverity(strength) {
    if (strength >= 0.7) {
        return 'high';
    }
    if (strength >= 0.4) {
        return 'medium';
    }
    return 'low';
}
function healthGradeFromScore(score) {
    if (score >= 0.85)
        return 'A';
    if (score >= 0.7)
        return 'B';
    if (score >= 0.5)
        return 'C';
    if (score >= 0.3)
        return 'D';
    return 'F';
}
function cognitiveStressFromAggregate(stress) {
    if (stress >= 0.72) {
        return 'critical';
    }
    if (stress >= 0.45) {
        return 'elevated';
    }
    return 'stable';
}
function healthStatusFromAggregate(stress) {
    if (stress >= 0.72) {
        return 'critical';
    }
    if (stress >= 0.45) {
        return 'degraded';
    }
    return 'stable';
}
function maxTimestamp(values) {
    const finite = values.filter((value) => Number.isFinite(value));
    if (finite.length === 0) {
        return Date.now();
    }
    return Math.max(...finite);
}
