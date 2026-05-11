import { EVENTS } from '../../core/event-bus/events.js';
function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
// Helper: compute causal influence of a node (sum of target edge weights)
function computeCausalInfluence(nodeId, edges) {
    let influence = 0;
    for (const edge of edges.values()) {
        if (edge.source === nodeId) {
            influence += edge.causalStrength * (edge.direction === 'positive' ? 1 : -1);
        }
    }
    return clamp(influence, -1, 1);
}
export class BeliefGraphService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
        this.decayConfig = {
            regimeHalflifeCycles: 20, // nodes lose 50% evidence per 20 cycles of regime change
            timeDecayMs: 60000, // 1-minute time decay for anomalies
        };
    }
    start() {
        // Subscribe to all evidence streams
        this.bus.on(EVENTS.DECISION_SNAPSHOT, (event) => {
            this.onSnapshot(event);
        });
        this.bus.on(EVENTS.MICROSTRUCTURE, (event) => {
            const gs = this.getGraphState(event.contractId);
            this.updateMicrostructureNode(gs, event);
            this.emitLegacyUpdate(event.contractId, event.timestamp);
        });
        // Calibration events feed into confidence nodes
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            const gs = this.getGraphState(event.contractId);
            this.updateCalibrationNode(gs, event);
            this.emitLegacyUpdate(event.contractId, event.timestamp);
        });
        // Drift events feed into regime transition nodes
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const gs = this.getGraphState(event.contractId);
            this.updateDriftNode(gs, event);
            this.emitLegacyUpdate(event.contractId, event.timestamp);
        });
        // Anomaly events feed into anomaly detection nodes
        this.bus.on(EVENTS.ANOMALY, (event) => {
            const gs = this.getGraphState(event.contractId);
            this.updateAnomalyNode(gs, event);
            this.emitLegacyUpdate(event.contractId, event.timestamp);
        });
        // Feature intelligence events update microstructure nodes
        this.bus.on(EVENTS.FEATURE_INTELLIGENCE, (event) => {
            const gs = this.getGraphState(event.contractId);
            this.updateFeatureNode(gs, event);
            this.emitLegacyUpdate(event.contractId, event.timestamp);
        });
    }
    onSnapshot(snapshot) {
        const gs = this.getGraphState(snapshot.contractId);
        gs.lastSnapshot = snapshot;
        gs.cycleCount += 1;
        // Apply time decay to all nodes
        this.applyRegimeDecay(gs, snapshot.state.probability.regime);
        // Update probability and market regime nodes from snapshot
        this.updateProbabilityNodes(gs, snapshot);
        // Seed regime transition analysis
        if (snapshot.state.drift) {
            this.updateRegimeTransitionNode(gs, snapshot.state.drift, snapshot.state.probability.regime);
        }
        // Resolve contradictions
        const contradictions = this.resolveContradictions(gs);
        gs.contradictions = contradictions;
        // Compute summary
        const summary = this.computeSummary(gs, snapshot);
        // Emit belief graph state
        const beefEvent = {
            contractId: snapshot.contractId,
            snapshot_id: snapshot.snapshot_id,
            market_state_hash: snapshot.market_state_hash,
            cycle_id: `${snapshot.contractId}:belief:${gs.cycleCount}:${Date.now()}`,
            summary,
            timestamp: Date.now(),
        };
        this.bus.emit(EVENTS.BELIEF_GRAPH_STATE, beefEvent);
        this.emitLegacyUpdate(snapshot.contractId, beefEvent.timestamp);
    }
    updateMicrostructureNode(gs, event) {
        const now = Date.now();
        const belief = clamp(0.5 + event.obi * 0.35 + event.sweepProbability * 0.15 - event.spreadExpansionScore * 0.2, 0.01, 0.99);
        const node = {
            nodeId: 'microstructure-imbalance',
            hypothesis: `microstructure_obi=${event.obi.toFixed(3)} sweep=${event.sweepProbability.toFixed(3)}`,
            nodeType: 'market',
            evidence: belief,
            uncertainty: clamp(event.spreadExpansionScore + (event.liquidityRegime === 'vacuum' ? 0.2 : 0), 0, 1),
            lastUpdatedMs: now,
            decayFactor: 1,
            regime: 'trending',
        };
        gs.nodes.set(node.nodeId, node);
    }
    emitLegacyUpdate(contractId, timestamp) {
        const gs = this.getGraphState(contractId);
        const nodes = Array.from(gs.nodes.values()).map((node) => ({
            id: node.nodeId,
            type: node.nodeId.startsWith('microstructure-') ? 'microstructure' : node.nodeType,
            belief: Number(node.evidence.toFixed(4)),
            uncertainty: Number(node.uncertainty.toFixed(4)),
            rationale: node.hypothesis,
        }));
        const edges = Array.from(gs.edges.values()).map((edge) => ({
            from: edge.source,
            to: edge.target,
            weight: Number(edge.causalStrength.toFixed(4)),
        }));
        const avgBelief = nodes.length > 0 ? nodes.reduce((sum, node) => sum + node.belief, 0) / nodes.length : 0.5;
        const avgUncertainty = nodes.length > 0
            ? nodes.reduce((sum, node) => sum + node.uncertainty, 0) / nodes.length
            : 0.5;
        const event = {
            contractId,
            nodes,
            edges,
            constitutionalAdjustment: Number(clamp((avgBelief - 0.5) * 0.18, -0.09, 0.09).toFixed(6)),
            graphConfidence: Number(clamp(1 - avgUncertainty, 0, 1).toFixed(6)),
            timestamp,
        };
        this.bus.emit(EVENTS.BELIEF_GRAPH_UPDATE, event);
    }
    applyRegimeDecay(gs, currentRegime) {
        const now = Date.now();
        for (const node of gs.nodes.values()) {
            // If node was strong under a different regime, decay its evidence
            if (node.regime !== currentRegime) {
                const regimeShiftCycles = Math.max(1, gs.cycleCount - Math.floor(node.lastUpdatedMs / 1000 / 60));
                const decayFactor = Math.pow(0.5, regimeShiftCycles / this.decayConfig.regimeHalflifeCycles);
                node.evidence *= decayFactor;
                node.decayFactor = decayFactor;
                node.uncertainty = Math.min(1, node.uncertainty + 0.1 * (1 - decayFactor)); // uncertainty increases with decay
            }
            // Time decay for old updates
            const ageMs = now - node.lastUpdatedMs;
            if (ageMs > this.decayConfig.timeDecayMs) {
                const timeFactor = Math.pow(0.5, ageMs / this.decayConfig.timeDecayMs);
                node.evidence *= timeFactor;
            }
            node.evidence = clamp(node.evidence, 0, 1);
            node.uncertainty = clamp(node.uncertainty, 0, 1);
        }
    }
    updateProbabilityNodes(gs, snapshot) {
        const prob = snapshot.state.probability;
        const now = Date.now();
        // Node: bullish-sentiment
        const bullEdge = prob.estimatedProbability - 0.5;
        const bullEvidence = bullEdge > 0 ? bullEdge * 2 : 0.5 + bullEdge; // asymmetric; yes>0.5 is strong bullish
        const bullNode = {
            nodeId: 'bullish-sentiment',
            hypothesis: `estimated_probability (${prob.estimatedProbability.toFixed(2)}) > market_implied (${prob.marketImpliedProbability.toFixed(2)})`,
            nodeType: 'market',
            evidence: clamp(bullEvidence, 0, 1),
            uncertainty: prob.uncertaintyScore,
            lastUpdatedMs: now,
            decayFactor: 1,
            regime: prob.regime,
        };
        gs.nodes.set('bullish-sentiment', bullNode);
        // Node: edge-present (edge > 0.02)
        const edgeNode = {
            nodeId: 'edge-present',
            hypothesis: `market_offers_positive_edge (${prob.edge.toFixed(4)})`,
            nodeType: 'market',
            evidence: Math.abs(prob.edge) > 0.02 ? clamp(Math.abs(prob.edge) * 10, 0, 1) : 0.2,
            uncertainty: 0.15,
            lastUpdatedMs: now,
            decayFactor: 1,
            regime: prob.regime,
        };
        gs.nodes.set('edge-present', edgeNode);
        // Add causal edge: bullish-sentiment -> edge-present (bullish increases probability of edge)
        gs.edges.set('bullish-sentiment->edge-present', {
            source: 'bullish-sentiment',
            target: 'edge-present',
            causalStrength: 0.7,
            direction: 'positive',
            description: 'bullish pressure increases edge likelihood',
            lastUpdatedMs: now,
        });
    }
    updateCalibrationNode(gs, event) {
        const now = Date.now();
        const calibrationScore = clamp(1 - event.ece, 0, 1); // higher ECE = lower calibration evidence
        const node = {
            nodeId: 'calibration-reliable',
            hypothesis: `model_calibration_score=${calibrationScore.toFixed(2)} (ece=${event.ece.toFixed(3)})`,
            nodeType: 'calibration',
            evidence: calibrationScore,
            uncertainty: event.brier, // Brier score as measure of calibration uncertainty
            lastUpdatedMs: now,
            decayFactor: 1,
            regime: 'trending', // calibration is regime-agnostic
        };
        gs.nodes.set('calibration-reliable', node);
    }
    updateDriftNode(gs, event) {
        const now = Date.now();
        let driftSeverity = 0.2;
        if (event.severity === 'high') {
            driftSeverity = 0.8;
        }
        else if (event.severity === 'medium') {
            driftSeverity = 0.5;
        }
        const driftEvidence = 1 - driftSeverity; // high drift = low evidence that model is stable
        const node = {
            nodeId: 'model-stability',
            hypothesis: `feature_distribution_stable (psi=${event.psi.toFixed(3)}, severity=${event.severity})`,
            nodeType: 'drift',
            evidence: driftEvidence,
            uncertainty: Math.min(1, event.psi), // psi is proxy for uncertainty
            lastUpdatedMs: now,
            decayFactor: 1,
            regime: 'trending',
        };
        gs.nodes.set('model-stability', node);
    }
    updateAnomalyNode(gs, event) {
        const now = Date.now();
        const severityToEvidence = {
            critical: 0.95,
            high: 0.75,
            medium: 0.5,
            low: 0.2,
        };
        const node = {
            nodeId: `anomaly-${event.type}`,
            hypothesis: `${event.type} detected (severity=${event.severity})`,
            nodeType: 'anomaly',
            evidence: severityToEvidence[event.severity] ?? 0.3,
            uncertainty: 1 - event.confidenceDegradation, // inverse: high degradation = high uncertainty
            lastUpdatedMs: now,
            decayFactor: 1,
            regime: 'choppy', // anomalies are choppy regime signals
        };
        gs.nodes.set(`anomaly-${event.type}`, node);
        // Add causal edge: anomaly -> reduced-confidence
        gs.edges.set(`anomaly-${event.type}->market-confidence-reduced`, {
            source: `anomaly-${event.type}`,
            target: 'market-confidence-reduced',
            causalStrength: severityToEvidence[event.severity] ?? 0.3,
            direction: 'positive',
            description: `${event.type} reduces confidence`,
            lastUpdatedMs: now,
        });
    }
    updateFeatureNode(gs, event) {
        const now = Date.now();
        const node = {
            nodeId: 'features-high-quality',
            hypothesis: `feature_quality_score=${event.qualityScore.toFixed(2)} (missing_rate=${event.missingRate.toFixed(3)})`,
            nodeType: 'market',
            evidence: event.qualityScore,
            uncertainty: event.missingRate + event.driftHint, // higher missing rate + drift = more uncertainty
            lastUpdatedMs: now,
            decayFactor: 1,
            regime: 'trending',
        };
        gs.nodes.set('features-high-quality', node);
    }
    updateRegimeTransitionNode(gs, driftEvent, regime) {
        const now = Date.now();
        const transitionHazard = clamp(driftEvent.psi * 0.5, 0, 1); // PSI as proxy for regime shift probability
        const node = {
            nodeId: 'regime-transition-imminent',
            hypothesis: `regime may shift from ${regime} (transitional_hazard=${transitionHazard.toFixed(2)})`,
            nodeType: 'regime-transition',
            evidence: transitionHazard,
            uncertainty: 0.3, // regime transitions are inherently uncertain
            lastUpdatedMs: now,
            decayFactor: 1,
            regime,
        };
        gs.nodes.set('regime-transition-imminent', node);
    }
    resolveContradictions(gs) {
        const contradictions = [];
        // Define mutually exclusive node pairs
        const conflictPairs = [
            ['bullish-sentiment', 'bearish-sentiment'],
            ['model-stability', 'model-volatility'],
            ['features-high-quality', 'features-degraded'],
        ];
        for (const [node1Id, node2Id] of conflictPairs) {
            const n1 = gs.nodes.get(node1Id);
            const n2 = gs.nodes.get(node2Id);
            if (!n1 || !n2)
                continue;
            // Conflict strength: if both have high evidence, they contradict
            const conflictStrength = Math.sqrt(n1.evidence * n2.evidence); // geometric mean
            if (conflictStrength > 0.3) {
                contradictions.push({
                    hypothesis1: node1Id,
                    hypothesis2: node2Id,
                    conflictStrength,
                    conflictReason: `both ${node1Id} (evidence=${n1.evidence.toFixed(2)}) and ${node2Id} (evidence=${n2.evidence.toFixed(2)}) are strong`,
                    suggestedResolution: `reduce confidence in weaker hypothesis: ${n1.evidence > n2.evidence ? node2Id : node1Id}`,
                    timestamp: Date.now(),
                });
            }
        }
        // Anomaly vs trading contradiction
        const anomalyNodes = Array.from(gs.nodes.keys()).filter((k) => k.startsWith('anomaly-'));
        for (const anomId of anomalyNodes) {
            const anom = gs.nodes.get(anomId);
            if (!anom)
                continue;
            if (anom.evidence > 0.6) {
                contradictions.push({
                    hypothesis1: anomId,
                    hypothesis2: 'edge-present',
                    conflictStrength: anom.evidence * 0.5,
                    conflictReason: `anomaly ${anomId} reduces confidence in edge`,
                    suggestedResolution: 'reduce trade size or increase passive execution style',
                    timestamp: Date.now(),
                });
            }
        }
        return contradictions;
    }
    computeSummary(gs, snapshot) {
        const now = Date.now();
        // Belief-adjusted probability: weighted consensus of bullish/bearish nodes
        const bullish = gs.nodes.get('bullish-sentiment');
        const edgePresent = gs.nodes.get('edge-present');
        const calibrated = gs.nodes.get('calibration-reliable');
        const stable = gs.nodes.get('model-stability');
        const baseProb = snapshot.state.probability.estimatedProbability;
        let beliefAdjustedProb = baseProb;
        if (bullish) {
            beliefAdjustedProb += bullish.evidence * 0.2 * (bullish.evidence - 0.5);
        }
        if (edgePresent) {
            const edgeDir = snapshot.state.probability.edge > 0 ? 1 : -1;
            beliefAdjustedProb += edgeDir * edgePresent.evidence * 0.15;
        }
        if (calibrated && calibrated.evidence > 0.5) {
            beliefAdjustedProb += (calibrated.evidence - 0.5) * 0.1;
        }
        if (stable && stable.evidence < 0.4) {
            // Low stability reduces conviction
            beliefAdjustedProb = (beliefAdjustedProb + 0.5) / 2;
        }
        beliefAdjustedProb = clamp(beliefAdjustedProb, 0.01, 0.99);
        // Uncertainty interval
        const avgUncertainty = Array.from(gs.nodes.values()).reduce((sum, n) => sum + n.uncertainty, 0) / Math.max(1, gs.nodes.size);
        const margin = clamp(avgUncertainty * 0.25, 0.01, 0.3);
        const beliefUncertaintyInterval = [
            clamp(beliefAdjustedProb - margin, 0, 1),
            clamp(beliefAdjustedProb + margin, 0, 1),
        ];
        // Top hypotheses
        const topHypotheses = Array.from(gs.nodes.values())
            .sort((a, b) => {
            const influenceA = computeCausalInfluence(a.nodeId, gs.edges);
            const influenceB = computeCausalInfluence(b.nodeId, gs.edges);
            return (b.evidence + influenceB) - (a.evidence + influenceA);
        })
            .slice(0, 5)
            .map((n) => ({
            nodeId: n.nodeId,
            hypothesis: n.hypothesis,
            evidence: n.evidence,
            uncertainty: n.uncertainty,
            causalInfluence: computeCausalInfluence(n.nodeId, gs.edges),
        }));
        // Regime transition hazard (from regime-transition node if exists)
        const regimeNode = gs.nodes.get('regime-transition-imminent');
        const regimeTransitionHazard = regimeNode?.evidence ?? 0;
        const regimeTransitionConfidence = regimeNode ? 1 - regimeNode.uncertainty : 0.5;
        // Next predicted regimes (placeholder: cycle through regime space if hazard > 0.5)
        const nextPredictedRegimes = [];
        if (regimeTransitionHazard > 0.5) {
            const currentRegime = snapshot.state.probability.regime;
            const regimeProgression = {
                trending: ['momentum-ignition', 'expansion'],
                choppy: ['reversal-prone', 'compression'],
                panic: ['reversal-prone', 'choppy'],
                'low-liquidity': ['compression', 'choppy'],
                'reversal-prone': ['trending', 'choppy'],
                'momentum-ignition': ['expansion', 'trending'],
                compression: ['expansion', 'choppy'],
                expansion: ['trending', 'choppy'],
            };
            nextPredictedRegimes.push(...(regimeProgression[currentRegime] ?? ['choppy']));
        }
        // Graph health
        const graphDensity = gs.edges.size / Math.max(1, gs.nodes.size * (gs.nodes.size - 1));
        const entropies = Array.from(gs.nodes.values()).map((n) => {
            const p = clamp(n.evidence, 0.0001, 0.9999); // clamp to avoid log(0)
            return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
        });
        const graphEntropy = entropies.length > 0 ? entropies.reduce((a, b) => a + b, 0) / entropies.length : 0;
        const strongestBeliefs = Array.from(gs.nodes.values()).filter((n) => n.evidence > 0.7).length;
        const weakestBeliefs = Array.from(gs.nodes.values()).filter((n) => n.evidence < 0.3 && n.uncertainty > 0.5).length;
        return {
            contractId: snapshot.contractId,
            snapshot_id: snapshot.snapshot_id,
            market_state_hash: snapshot.market_state_hash,
            cycle_id: `${snapshot.contractId}:bf:${gs.cycleCount}:${now}`,
            beliefAdjustedProbability: beliefAdjustedProb,
            beliefUncertaintyInterval,
            contradictions: gs.contradictions,
            contradictionCount: gs.contradictions.length,
            maxContradictionStrength: gs.contradictions.length > 0 ? Math.max(...gs.contradictions.map((c) => c.conflictStrength)) : 0,
            topHypotheses,
            regimeTransitionHazard,
            regimeTransitionConfidence,
            nextPredictedRegimes,
            graphDensity,
            graphEntropy,
            strongestBeliefs,
            weakestBeliefs,
            timestamp: now,
        };
    }
    getGraphState(contractId) {
        if (!this.state.has(contractId)) {
            this.state.set(contractId, {
                nodes: new Map(),
                edges: new Map(),
                recentUpdates: [],
                contradictions: [],
                lastSnapshot: null,
                cycleCount: 0,
            });
        }
        const graphState = this.state.get(contractId);
        if (!graphState) {
            throw new Error(`Graph state unavailable for contract ${contractId}`);
        }
        return graphState;
    }
}
