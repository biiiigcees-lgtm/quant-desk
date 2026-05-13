import { MonotonicLogicalClock } from '../../core/determinism/logical-clock.js';
import { EVENTS } from '../../core/event-bus/events.js';
export class ConstitutionalDecisionService {
    constructor(bus, clock = new MonotonicLogicalClock()) {
        this.bus = bus;
        this.clock = clock;
        this.byContract = new Map();
        this.currentRuleTimestamp = 1;
    }
    start() {
        this.bus.on(EVENTS.DECISION_SNAPSHOT, (event) => {
            const state = this.getState(event.contractId);
            state.snapshot = event;
        });
        this.bus.on(EVENTS.DECISION_SNAPSHOT_INVALID, (event) => {
            const state = this.getState(event.contractId);
            state.invalid = event;
        });
        this.bus.on(EVENTS.EXECUTION_CONTROL, (event) => {
            const contractId = event.contractId ?? 'KXBTC-DEMO';
            const state = this.getState(contractId);
            state.executionControl = event;
        });
        this.bus.on(EVENTS.SIMULATION_UNIVERSE, (event) => {
            for (const state of this.byContract.values()) {
                state.simulation = event;
            }
        });
        this.bus.on(EVENTS.BELIEF_GRAPH_STATE, (event) => {
            const state = this.getState(event.contractId);
            state.beliefGraph = event;
        });
        this.bus.on(EVENTS.SCENARIO_BRANCH_STATE, (event) => {
            const state = this.getState(event.contractId);
            state.scenarioBranch = event;
        });
        this.bus.on(EVENTS.CROSS_MARKET_CAUSAL_STATE, (event) => {
            const state = this.getState(event.contractId);
            state.crossMarket = event;
        });
        this.bus.on(EVENTS.MARKET_WORLD_STATE, (event) => {
            const state = this.getState(event.contractId);
            state.marketWorld = event;
        });
        this.bus.on(EVENTS.MARKET_EXPERIENCE, (event) => {
            const state = this.getState(event.contractId);
            state.marketExperience = event;
        });
        this.bus.on(EVENTS.META_CALIBRATION, (event) => {
            const state = this.getState(event.contractId);
            state.metaCalibration = event;
        });
        this.bus.on(EVENTS.OPERATOR_ATTENTION, (event) => {
            const state = this.getState(event.contractId);
            state.operatorAttention = event;
        });
        this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
            const decision = this.buildDecision(event);
            this.bus.emit(EVENTS.CONSTITUTIONAL_DECISION, decision);
        });
    }
    buildDecision(ai) {
        const state = this.getState(ai.contractId);
        state.sequence += 1;
        const governanceLog = [];
        const conflicts = [];
        const decisionState = {
            tradeAllowed: true,
            executionMode: ai.execution_recommendation.orderStyle === 'market' ? 'market' : 'passive',
        };
        const snapshot = state.snapshot;
        const decisionTime = this.clock.observe(ai.timestamp);
        this.currentRuleTimestamp = decisionTime;
        this.applySnapshotRules(snapshot, state.invalid, governanceLog, decisionState);
        this.applyHardRiskRule(state.executionControl, governanceLog, decisionState);
        this.applyMetaCalibrationRule(state.metaCalibration, governanceLog, conflicts, decisionState);
        this.applyScenarioBranchRule(state.scenarioBranch, governanceLog, conflicts, decisionState);
        let riskLevel = clamp(ai.risk_level.score, 0, 100);
        riskLevel = this.applyCrossMarketRiskAdjustment(state.crossMarket, riskLevel, governanceLog, conflicts);
        riskLevel = this.applyMarketWorldRiskAdjustment(state.marketWorld, riskLevel, governanceLog);
        riskLevel = this.applyMarketExperienceRiskAdjustment(state.marketExperience, riskLevel, governanceLog, conflicts);
        this.applyRiskScoreRule(riskLevel, governanceLog, decisionState);
        const regime = ai.market_state.regime;
        const lowLiquidity = regime.includes('low-liquidity') ||
            regime.includes('thin') ||
            state.marketWorld?.participantIntent === 'liquidation';
        this.applyLiquidityRule(lowLiquidity, governanceLog, conflicts, decisionState);
        const highAnomaly = ai.anomaly_flags.some((flag) => flag.severity === 'high' || flag.score >= 70) ||
            Boolean(state.scenarioBranch?.invalidated && (state.scenarioBranch?.volatilityWeight ?? 0) > 0.72);
        this.applyAnomalyRule(highAnomaly, governanceLog, conflicts, decisionState);
        this.recordRiskExecutionConflict(ai, conflicts);
        const snapshotProbability = snapshot ? snapshot.state.probability.estimatedProbability : 0.5;
        const marketImplied = snapshot ? snapshot.state.probability.marketImpliedProbability : 0.5;
        const adjustment = clamp(ai.probability_adjustment.recommendedAdjustment, -0.2, 0.2);
        let finalProbability = clamp(snapshotProbability + adjustment, 0.01, 0.99);
        const beliefGraph = state.beliefGraph;
        finalProbability = this.applyBeliefGraphIntegration(beliefGraph, finalProbability, governanceLog, conflicts, decisionState);
        finalProbability = this.applyMarketWorldProbabilityAdjustment(state.marketWorld, finalProbability, governanceLog);
        finalProbability = this.applyMarketExperienceProbabilityAdjustment(state.marketExperience, finalProbability, marketImplied, governanceLog, conflicts, decisionState);
        finalProbability = this.applyAuthorityDecayProbabilityAdjustment(state.metaCalibration, finalProbability, marketImplied, governanceLog);
        let confidenceScore = clamp((ai.market_state.confidence * 0.45 + ai.risk_level.confidence * 0.35 + ai.execution_recommendation.confidence * 0.2), 0, 1);
        confidenceScore = this.applyBeliefGraphConfidenceAdjustment(beliefGraph, confidenceScore);
        confidenceScore = this.applyMetaCalibrationConfidenceAdjustment(state.metaCalibration, confidenceScore, governanceLog);
        confidenceScore = this.applyOperatorAttentionConfidenceAdjustment(state.operatorAttention, confidenceScore, governanceLog);
        confidenceScore = this.applyMarketExperienceConfidenceAdjustment(state.marketExperience, confidenceScore, governanceLog);
        confidenceScore = this.applyOverconfidenceClamp(ai.probability_adjustment.overconfidenceDetected, confidenceScore, governanceLog);
        const simulationResult = this.evaluateSimulationGate(state, governanceLog, decisionState);
        if (!decisionState.tradeAllowed) {
            finalProbability = clamp((finalProbability + marketImplied) / 2, 0.01, 0.99);
        }
        this.recordRiskDirectionConflict(riskLevel, finalProbability, conflicts);
        const edgeScore = Number((finalProbability - marketImplied).toFixed(6));
        const decision = {
            cycle_id: `${ai.contractId}:${state.sequence}:${decisionTime}`,
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
            timestamp: decisionTime,
        };
        return decision;
    }
    recordRiskExecutionConflict(ai, conflicts) {
        if (ai.risk_level.recommendation === 'de-risk' && ai.execution_recommendation.orderStyle === 'market') {
            conflicts.push({
                category: 'risk-vs-execution',
                severity: 'medium',
                detail: 'risk recommends de-risk while execution recommendation is market',
            });
        }
    }
    applyMarketWorldProbabilityAdjustment(marketWorld, finalProbability, governanceLog) {
        if (!marketWorld) {
            return finalProbability;
        }
        const adjusted = clamp(finalProbability * 0.88 + marketWorld.syntheticLiquidityProbability * 0.12, 0.01, 0.99);
        governanceLog.push(this.rule('market-world-integration', 'adjust', `intent=${marketWorld.participantIntent}, world_conf=${marketWorld.worldConfidence.toFixed(3)}`));
        return adjusted;
    }
    applyMarketExperienceProbabilityAdjustment(marketExperience, finalProbability, marketImplied, governanceLog, conflicts, decisionState) {
        if (!marketExperience?.recurringFailureSignature) {
            return finalProbability;
        }
        const adjusted = clamp((finalProbability + marketImplied * 2) / 3, 0.01, 0.99);
        governanceLog.push(this.rule('market-memory-trauma', 'adjust', `trauma_penalty=${marketExperience.traumaPenalty.toFixed(3)} recurrent_signature=true`));
        if (marketExperience.traumaPenalty > 0.78) {
            decisionState.tradeAllowed = false;
            decisionState.executionMode = 'blocked';
            conflicts.push({
                category: 'anomaly-vs-trade',
                severity: 'high',
                detail: 'blocked due to recurrent market trauma signature',
            });
        }
        return adjusted;
    }
    applyAuthorityDecayProbabilityAdjustment(metaCalibration, finalProbability, marketImplied, governanceLog) {
        if ((metaCalibration?.authorityDecay ?? 0) <= 0.78) {
            return finalProbability;
        }
        const adjusted = clamp((finalProbability + marketImplied) / 2, 0.01, 0.99);
        governanceLog.push(this.rule('meta-calibration-authority', 'adjust', `authority_decay=${metaCalibration?.authorityDecay.toFixed(3)} probability pulled toward market-implied`));
        return adjusted;
    }
    applyMarketExperienceConfidenceAdjustment(marketExperience, confidenceScore, governanceLog) {
        if (!marketExperience) {
            return confidenceScore;
        }
        const traumaFactor = clamp(1 - marketExperience.traumaPenalty * 0.4, 0.6, 1);
        const adjusted = clamp(confidenceScore * traumaFactor, 0, 1);
        governanceLog.push(this.rule('market-experience-confidence', 'adjust', `retrieval_conf=${marketExperience.retrievalConfidence.toFixed(3)} trauma_penalty=${marketExperience.traumaPenalty.toFixed(3)}`));
        return adjusted;
    }
    applyOverconfidenceClamp(overconfidenceDetected, confidenceScore, governanceLog) {
        if (overconfidenceDetected) {
            const adjusted = clamp(confidenceScore * 0.72, 0, 1);
            governanceLog.push(this.rule('overconfidence-clamp', 'adjust', 'confidence reduced due to overconfidence signal'));
            return adjusted;
        }
        governanceLog.push(this.rule('overconfidence-clamp', 'pass', 'no overconfidence clamp required'));
        return confidenceScore;
    }
    evaluateSimulationGate(state, governanceLog, decisionState) {
        const sim = state.simulation;
        const scenarioTailLift = (state.scenarioBranch?.volatilityWeight ?? 0) * 0.25;
        const transmissionTailLift = (state.crossMarket?.riskTransmissionScore ?? 0) * 0.2;
        const simulationResult = {
            passed: true,
            divergenceScore: 0,
            scenarioCount: sim?.scenarioCount ?? 0,
            tailProbability: clamp((sim?.tailProbability ?? 0.1) + scenarioTailLift + transmissionTailLift, 0, 1),
            worstCasePnl: sim?.worstCasePnl ?? 0,
            reason: 'simulation-ok',
        };
        const divergenceScore = clamp(Math.abs(simulationResult.worstCasePnl) / 200, 0, 1);
        simulationResult.divergenceScore = divergenceScore;
        const authorityDecay = state.metaCalibration?.authorityDecay ?? 0;
        const divergenceThreshold = authorityDecay > 0.7 ? 0.52 : 0.6;
        const tailThreshold = authorityDecay > 0.7 ? 0.38 : 0.45;
        const blocked = divergenceScore > divergenceThreshold || simulationResult.tailProbability > tailThreshold;
        if (blocked) {
            simulationResult.passed = false;
            simulationResult.reason = 'simulation-divergence-threshold';
            governanceLog.push(this.rule('simulation-gate', 'block', simulationResult.reason));
            decisionState.tradeAllowed = false;
            decisionState.executionMode = 'blocked';
            return simulationResult;
        }
        governanceLog.push(this.rule('simulation-gate', 'pass', 'simulation within threshold'));
        return simulationResult;
    }
    recordRiskDirectionConflict(riskLevel, finalProbability, conflicts) {
        if (riskLevel >= 70 && finalProbability > 0.55) {
            conflicts.push({
                category: 'risk-vs-direction',
                severity: 'medium',
                detail: 'bullish probability under elevated risk regime',
            });
        }
    }
    applySnapshotRules(snapshot, invalid, governanceLog, decisionState) {
        if (snapshot) {
            governanceLog.push(this.rule('snapshot-required', 'pass', `snapshot=${snapshot.snapshot_id}`));
        }
        else {
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
    applyHardRiskRule(control, governanceLog, decisionState) {
        if (control?.mode === 'hard-stop') {
            governanceLog.push(this.rule('hard-risk-veto', 'block', `execution control=${control.reason}`));
            decisionState.tradeAllowed = false;
            decisionState.executionMode = 'blocked';
            return;
        }
        governanceLog.push(this.rule('hard-risk-veto', 'pass', `execution control=${control?.mode ?? 'normal'}`));
    }
    applyRiskScoreRule(riskLevel, governanceLog, decisionState) {
        if (riskLevel >= 85) {
            governanceLog.push(this.rule('risk-score-threshold', 'block', `risk=${riskLevel}`));
            decisionState.tradeAllowed = false;
            decisionState.executionMode = 'blocked';
            return;
        }
        governanceLog.push(this.rule('risk-score-threshold', 'pass', `risk=${riskLevel}`));
    }
    applyLiquidityRule(lowLiquidity, governanceLog, conflicts, decisionState) {
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
    applyAnomalyRule(highAnomaly, governanceLog, conflicts, decisionState) {
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
    applyBeliefGraphRule(beliefGraph, governanceLog, conflicts, decisionState) {
        const summary = beliefGraph.summary;
        // Check for high contradictions
        if (summary.maxContradictionStrength > 0.7) {
            governanceLog.push(this.rule('belief-contradiction-alert', 'adjust', `${summary.contradictionCount} contradictions detected, max_strength=${summary.maxContradictionStrength.toFixed(2)}`));
            // Reduce confidence but don't block
            decisionState.executionMode = 'passive';
            conflicts.push({
                category: 'risk-vs-execution',
                severity: 'medium',
                detail: `belief graph contradictions force passive mode`,
            });
        }
        // Check for extreme uncertainty
        const [lower, upper] = summary.beliefUncertaintyInterval;
        const uncertainty = (upper - lower) / 2;
        if (uncertainty > 0.35) {
            governanceLog.push(this.rule('belief-uncertainty-threshold', 'adjust', `high epistemic uncertainty (${uncertainty.toFixed(3)}), reducing confidence`));
            if (uncertainty > 0.45) {
                // Very high uncertainty: block if market execution
                if (decisionState.executionMode === 'market') {
                    decisionState.executionMode = 'passive';
                    governanceLog.push(this.rule('belief-uncertainty-threshold', 'adjust', 'extreme uncertainty forces passive'));
                }
            }
        }
        // Check regime transition hazard
        if (summary.regimeTransitionHazard > 0.65) {
            governanceLog.push(this.rule('regime-transition-hazard', 'adjust', `regime_switch_probability=${summary.regimeTransitionHazard.toFixed(2)}, next_regimes=${summary.nextPredictedRegimes.join(',')}`));
            if (decisionState.executionMode === 'market') {
                decisionState.executionMode = 'passive';
                governanceLog.push(this.rule('regime-transition-hazard', 'adjust', 'high transition hazard forces passive'));
            }
        }
        // Check graph health
        if (summary.graphEntropy > 1.5) {
            governanceLog.push(this.rule('belief-graph-entropy', 'adjust', `high entropy=${summary.graphEntropy.toFixed(2)}, weak signal consensus`));
        }
        if (summary.weakestBeliefs > summary.strongestBeliefs * 2) {
            governanceLog.push(this.rule('belief-graph-health', 'adjust', `weak beliefs (${summary.weakestBeliefs}) > strong beliefs (${summary.strongestBeliefs}), reduce conviction`));
        }
    }
    applyBeliefGraphIntegration(beliefGraph, finalProbability, governanceLog, conflicts, decisionState) {
        if (!beliefGraph) {
            governanceLog.push(this.rule('belief-graph-integration', 'pass', 'no belief graph available'));
            return finalProbability;
        }
        this.applyBeliefGraphRule(beliefGraph, governanceLog, conflicts, decisionState);
        let adjustedProb = 0.9 * finalProbability + 0.1 * beliefGraph.summary.beliefAdjustedProbability;
        adjustedProb = clamp(adjustedProb, 0.01, 0.99);
        governanceLog.push(this.rule('belief-graph-integration', 'adjust', `belief_prob=${beliefGraph.summary.beliefAdjustedProbability.toFixed(3)}, uncertainty=[${beliefGraph.summary.beliefUncertaintyInterval[0].toFixed(3)}, ${beliefGraph.summary.beliefUncertaintyInterval[1].toFixed(3)})`));
        return adjustedProb;
    }
    applyBeliefGraphConfidenceAdjustment(beliefGraph, confidenceScore) {
        if (!beliefGraph) {
            return confidenceScore;
        }
        const avgUncertainty = (beliefGraph.summary.beliefUncertaintyInterval[1] - beliefGraph.summary.beliefUncertaintyInterval[0]) / 2;
        return clamp(confidenceScore * (1 - avgUncertainty * 0.3), 0, 1);
    }
    applyMetaCalibrationRule(metaCalibration, governanceLog, conflicts, decisionState) {
        if (!metaCalibration) {
            governanceLog.push(this.rule('meta-calibration-authority', 'pass', 'no meta calibration available'));
            return;
        }
        if (metaCalibration.authorityDecay > 0.85) {
            governanceLog.push(this.rule('meta-calibration-authority', 'block', `authority_decay=${metaCalibration.authorityDecay.toFixed(3)}`));
            decisionState.tradeAllowed = false;
            decisionState.executionMode = 'blocked';
            conflicts.push({
                category: 'anomaly-vs-trade',
                severity: 'high',
                detail: 'authority decay exceeded constitutional hard limit',
            });
            return;
        }
        if (metaCalibration.authorityDecay > 0.65 && decisionState.executionMode === 'market') {
            governanceLog.push(this.rule('meta-calibration-authority', 'adjust', `authority_decay=${metaCalibration.authorityDecay.toFixed(3)}`));
            decisionState.executionMode = 'passive';
        }
        else {
            governanceLog.push(this.rule('meta-calibration-authority', 'pass', 'authority decay within tolerance'));
        }
    }
    applyScenarioBranchRule(scenarioBranch, governanceLog, conflicts, decisionState) {
        if (!scenarioBranch) {
            governanceLog.push(this.rule('scenario-branch-validity', 'pass', 'no scenario branch state available'));
            return;
        }
        if (scenarioBranch.invalidated && scenarioBranch.volatilityWeight > 0.68) {
            governanceLog.push(this.rule('scenario-branch-validity', 'block', `dominant=${scenarioBranch.dominantBranch} volatility=${scenarioBranch.volatilityWeight.toFixed(3)}`));
            decisionState.tradeAllowed = false;
            decisionState.executionMode = 'blocked';
            conflicts.push({
                category: 'anomaly-vs-trade',
                severity: 'high',
                detail: 'invalidated scenario branch under elevated volatility',
            });
            return;
        }
        if (scenarioBranch.volatilityWeight > 0.72 && decisionState.executionMode === 'market') {
            governanceLog.push(this.rule('scenario-branch-validity', 'adjust', `volatility=${scenarioBranch.volatilityWeight.toFixed(3)}`));
            decisionState.executionMode = 'passive';
            return;
        }
        governanceLog.push(this.rule('scenario-branch-validity', 'pass', `dominant=${scenarioBranch.dominantBranch}`));
    }
    applyCrossMarketRiskAdjustment(crossMarket, riskLevel, governanceLog, conflicts) {
        if (!crossMarket) {
            governanceLog.push(this.rule('cross-market-transmission', 'pass', 'no cross-market causal state available'));
            return riskLevel;
        }
        const adjustedRisk = clamp(riskLevel + crossMarket.riskTransmissionScore * 18, 0, 100);
        if (adjustedRisk > riskLevel + 5) {
            governanceLog.push(this.rule('cross-market-transmission', 'adjust', `risk uplift=${(adjustedRisk - riskLevel).toFixed(2)} driver=${crossMarket.dominantDriver}`));
            conflicts.push({
                category: 'risk-vs-direction',
                severity: adjustedRisk >= 80 ? 'high' : 'medium',
                detail: `cross-market transmission elevated risk via ${crossMarket.dominantDriver}`,
            });
        }
        else {
            governanceLog.push(this.rule('cross-market-transmission', 'pass', 'transmission within tolerance'));
        }
        return adjustedRisk;
    }
    applyMarketWorldRiskAdjustment(marketWorld, riskLevel, governanceLog) {
        if (!marketWorld) {
            governanceLog.push(this.rule('market-world-pressure', 'pass', 'no market world state available'));
            return riskLevel;
        }
        const pressureLift = marketWorld.forcedPositioningPressure * 12;
        const reflexivityLift = marketWorld.reflexivityAcceleration * 8;
        const adjustedRisk = clamp(riskLevel + pressureLift + reflexivityLift, 0, 100);
        if (adjustedRisk > riskLevel + 3) {
            governanceLog.push(this.rule('market-world-pressure', 'adjust', `risk uplift=${(adjustedRisk - riskLevel).toFixed(2)} intent=${marketWorld.participantIntent}`));
            return adjustedRisk;
        }
        governanceLog.push(this.rule('market-world-pressure', 'pass', 'world pressure within tolerance'));
        return riskLevel;
    }
    applyMarketExperienceRiskAdjustment(marketExperience, riskLevel, governanceLog, conflicts) {
        if (!marketExperience) {
            governanceLog.push(this.rule('market-experience-risk', 'pass', 'no market experience available'));
            return riskLevel;
        }
        const uplift = marketExperience.traumaPenalty * 22;
        const adjustedRisk = clamp(riskLevel + uplift, 0, 100);
        if (adjustedRisk > riskLevel + 4) {
            governanceLog.push(this.rule('market-experience-risk', 'adjust', `risk uplift=${(adjustedRisk - riskLevel).toFixed(2)}`));
            if (marketExperience.recurringFailureSignature) {
                conflicts.push({
                    category: 'risk-vs-direction',
                    severity: adjustedRisk >= 80 ? 'high' : 'medium',
                    detail: `recurring failure signature in archetype=${marketExperience.archetype}`,
                });
            }
            return adjustedRisk;
        }
        governanceLog.push(this.rule('market-experience-risk', 'pass', 'experience risk within tolerance'));
        return riskLevel;
    }
    applyMetaCalibrationConfidenceAdjustment(metaCalibration, confidenceScore, governanceLog) {
        if (!metaCalibration) {
            return confidenceScore;
        }
        const calibrationFactor = clamp(0.75 + 0.35 * metaCalibration.compositeScore - 0.25 * metaCalibration.authorityDecay, 0.45, 1);
        const adjusted = clamp(confidenceScore * calibrationFactor, 0, 1);
        governanceLog.push(this.rule('meta-calibration-confidence', 'adjust', `composite=${metaCalibration.compositeScore.toFixed(3)} authority_decay=${metaCalibration.authorityDecay.toFixed(3)}`));
        return adjusted;
    }
    applyOperatorAttentionConfidenceAdjustment(operatorAttention, confidenceScore, governanceLog) {
        if (!operatorAttention) {
            return confidenceScore;
        }
        let factor = 1;
        if (operatorAttention.focus === 'focused') {
            factor *= 0.95;
        }
        if (operatorAttention.focus === 'critical') {
            factor *= 0.85;
        }
        factor *= clamp(1 - operatorAttention.density * 0.2, 0.75, 1);
        const adjusted = clamp(confidenceScore * factor, 0, 1);
        governanceLog.push(this.rule('operator-attention-density', 'adjust', `focus=${operatorAttention.focus} density=${operatorAttention.density.toFixed(3)} hotspots=${operatorAttention.contradictionHotspots.length}`));
        return adjusted;
    }
    getState(contractId) {
        const current = this.byContract.get(contractId);
        if (current) {
            return current;
        }
        const state = {
            snapshot: null,
            invalid: null,
            executionControl: null,
            simulation: null,
            beliefGraph: null,
            scenarioBranch: null,
            crossMarket: null,
            marketWorld: null,
            marketExperience: null,
            metaCalibration: null,
            operatorAttention: null,
            sequence: 0,
        };
        this.byContract.set(contractId, state);
        return state;
    }
    rule(rule, outcome, detail) {
        return {
            rule,
            outcome,
            detail,
            timestamp: this.currentRuleTimestamp,
        };
    }
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
