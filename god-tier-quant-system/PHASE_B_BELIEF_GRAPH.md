# Phase B Implementation: Belief-Graph Engine

## Overview
Phase B implements a probabilistic hypothesis DAG that models market beliefs, tracks causal relationships, and feeds regime-conditioned adjustments into constitutional governance decisions.

## Implementation Date
May 10, 2026

## Files Created

### Core Service
- **`services/belief-graph/service.ts`** (310 lines)
  - `BeliefGraphService` class
  - Methods: `onSnapshot`, `updateProbabilityNodes`, `updateCalibrationNode`, `updateDriftNode`, `updateAnomalyNode`, `updateRegimeTransitionNode`, `resolveContradictions`, `computeSummary`
  - Event handlers for market data, calibration, drift, anomaly, feature intelligence
  - Decay model: regime-based (50% per 20 cycles) + time-based (60s exponential)

### Test Suite
- **`tests/belief-graph.test.ts`** (287 lines, 7 tests, all passing)
  - `testBeliefGraphUpdatesFromSnapshot` ✓
  - `testBeliefGraphDetectsContradictions` ✓
  - `testBeliefGraphCalibrationNode` ✓
  - `testBeliefGraphFeedsConstitutionalDecision` ✓
  - `testBeliefGraphRegimeTransitionHazard` ✓
  - `testBeliefGraphGraphHealth` ✓
  - `testConstitutionalDecisionForcesPassiveOnContradictions` ✓

## Files Modified

### Event Schemas
- **`core/schemas/events.ts`** (+120 lines)
  - `BeliefGraphNode` interface
  - `BeliefGraphEdge` interface
  - `ContradictionDiagnostic` interface
  - `BeliefGraphSummary` interface
  - `BeliefGraphStateEvent` interface

### Event Bus
- **`core/event-bus/events.ts`** (+1 line)
  - Added `BELIEF_GRAPH_STATE: 'belief-graph:state'` to EVENTS constant

### Constitutional Decision Integration
- **`services/constitutional-decision/service.ts`** (+90 lines)
  - Added `beliefGraph: BeliefGraphStateEvent | null` to `ContractState` interface
  - Subscription to `EVENTS.BELIEF_GRAPH_STATE` in `start()` method
  - New `applyBeliefGraphRule()` method with governance logic:
    - Contradiction strength > 0.7 → force passive
    - Uncertainty margin > 0.35 → adjust
    - Uncertainty margin > 0.45 → force passive
    - Regime transition hazard > 0.65 → force passive
  - Belief probability blending: `0.9 * finalProb + 0.1 * beliefAdjustedProb`
  - Confidence adjustment: `confidence * (1 - avgUncertainty * 0.3)`
  - Updated `getState()` to initialize `beliefGraph: null`

### Service Registration
- **`main.ts`** (+3 lines)
  - Import `BeliefGraphService`
  - Instantiate: `const beliefGraph = new BeliefGraphService(bus)`
  - Start: `beliefGraph.start()` (before `constitutionalDecision.start()`)

### API Server
- **`apps/api/server.ts`** (+3 lines)
  - Subscribe to `EVENTS.BELIEF_GRAPH_STATE`
  - Track in `this.latest.beliefGraphState`

### Build Configuration
- **`package.json`** (+1 line)
  - Added script: `"test:belief-graph": "node --enable-source-maps dist/tests/belief-graph.test.js"`

## Architecture & Design

### Belief Node Types
1. **Market Nodes** (probability, edge-present, features-high-quality)
   - Feed from market data + feature streams
   - Track directional bias and edge availability

2. **Calibration Nodes** (calibration-reliable)
   - Track model reliability from ECE/Brier scores
   - Influence confidence weighting

3. **Drift Nodes** (model-stability)
   - PSI/KL from distribution shift detection
   - Decay when regime changes

4. **Anomaly Nodes** (anomaly-*)
   - Severity-mapped to evidence
   - Propagate constraints via causal edges

5. **Regime Nodes** (regime-transition-imminent)
   - Hazard scores from drift intensity
   - Predict next regime states

### Causal Edges
- `bullish-sentiment → edge-present` (0.7 strength, positive)
- `anomaly-* → market-confidence-reduced` (variable strength, positive)
- Others inferred from source signals

### Decay Model
- **Regime Decay**: Half-life of 20 cycles per regime shift
  - Formula: `evidence *= 0.5^(cyclesSinceUpdate / 20)`
  - Increases uncertainty inversely: `uncertainty += 0.1 * (1 - decayFactor)`
  
- **Time Decay**: 60s exponential for anomalies
  - Formula: `evidence *= 0.5^(ageMs / 60000)`

### Contradiction Resolution
- Detect mutually exclusive pairs: (bullish, bearish), (stable, volatile), (quality, degraded)
- Conflict strength: `sqrt(evidence_node1 * evidence_node2)`
- Report if strength > 0.3 with resolution hint

### Constitutional Integration
1. **Probability Blending** (10% weight advisory)
   - Final probability: `0.9 * snapshotProb + 0.1 * beliefProb`
   - Allows market data to override but belief influences

2. **Confidence Adjustment**
   - Belief-graph uncertainty reduces confidence
   - Adjustment: `conf * (1 - uncertainty * 0.3)`

3. **Execution Mode Overrides**
   - Contradictions > 0.7 → passive (graceful, not blocking)
   - Extreme uncertainty → passive or blocked
   - Regime hazard > 0.65 → passive

## Test Coverage

### Unit Tests (7 tests, all passing)
- Probability node creation from snapshots
- Contradiction detection with diagnostics
- Calibration evidence scaling
- Full feed-forward path to constitutional decision
- Regime transition hazard calculation
- Graph health metrics (density, entropy, belief distribution)
- Passive mode enforcement under contradiction

### Integration Tests
- Constitutional decision receives belief-graph events
- Governance traces logged for all adjustments
- Execution mode correctly forced to passive

### Smoke Tests
- System initializes with belief-graph service
- All services start in correct order
- No startup errors or warnings

## Validation Results

### Compilation
✅ TypeScript: no errors
✅ Type checking: strict mode passes
✅ Build: `npm run build` succeeds

### Testing
✅ belief-graph: 7/7 passed
✅ snapshot-sync: passed
✅ constitutional-decision: passed
✅ execution-lifecycle: passed
✅ authority-determinism: passed
✅ All prior tests still passing

### Runtime
✅ Smoke test: services initialize correctly
✅ Module exports: BeliefGraphService function available
✅ Event bus: BELIEF_GRAPH_STATE constant defined
✅ API state tracking: beliefGraphState accessible

## Integration Points

### Input Events
- `DECISION_SNAPSHOT` → triggers all node updates + decay
- `CALIBRATION_UPDATE` → updates calibration-reliable node
- `DRIFT_EVENT` → updates model-stability + regime-transition nodes
- `ANOMALY` → creates anomaly-* nodes + causal edges
- `FEATURE_INTELLIGENCE` → updates features-high-quality node

### Output Events
- `BELIEF_GRAPH_STATE` → emitted after snapshot processing

### Downstream Consumers
- `ConstitutionalDecisionService` subscribes to BELIEF_GRAPH_STATE
- `ApiServer` tracks latest belief-graph state in /state endpoint

## Performance Characteristics
- **Node Updates**: O(1) per event source
- **Decay Application**: O(n) where n = active nodes (~5-10 in steady state)
- **Contradiction Resolution**: O(n²) pairs checked (~5-20 checks per cycle)
- **Summary Computation**: O(n) for hypothesis ranking + health stats
- **Memory**: ~5-10 nodes + 5-15 edges per contract (~2KB per contract)

## Next Phase: Phase C - Causal Market Model
Build causal factor tracking service:
- Liquidity → volatility relationships
- Regime → strategy performance
- Macro → micro price pressure
- Feeds into belief graph via causal updates
- Enables spurious-signal rejection

## Known Limitations & Future Work
1. **Regime Prediction**: Currently deterministic next-regime list; could add probabilistic transitions
2. **Causal Learning**: Edges currently hard-coded; future: learn from outcome data
3. **Macro Context**: Phase C will add external signals (BTC, VIX, DXY)
4. **Multi-Contract**: Single instance per contract; could optimize shared graph structure
5. **Real-Time Decay**: Currently applied on snapshot; could add background decay job

## Deployment Checklist
- ✅ Code reviewed and tested
- ✅ All tests passing
- ✅ Type safety verified
- ✅ Service registration complete
- ✅ API integration complete
- ✅ Documentation complete
- ✅ Smoke tests pass
- ✅ No regressions in prior phases

## Author & Date
Implemented: May 10, 2026 (Current Session)
Phase Ordering: Phase B (following Phase A contracts, before Phase C causal model)
