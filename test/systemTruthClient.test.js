const { describe, it } = await import('node:test');
const { default: assert } = await import('node:assert/strict');

import {
  deriveRiskScalar,
  deriveSystemTruth,
  mapRiskLevel,
  shouldRetryStale,
} from '../lib/systemTruthClient.js';

describe('systemTruthClient', () => {
  it('derives an executable UP belief from a secure bullish setup', () => {
    const truth = deriveSystemTruth({
      pDecisionAbove: 0.71,
      confidence: 82,
      dataQuality: 0.9,
      flowToxicity: 22,
      realizedVol: 18,
      roundPhase: 'open',
    });

    assert.deepEqual(truth.currentBelief, { direction: 'UP', confidence: 82 });
    assert.equal(truth.executionAllowed, true);
    assert.equal(truth.riskLevel, 'LOW');
    assert.equal(truth.verdict, 'ABOVE');
    assert.deepEqual(truth.authority, {
      source: 'COGNITION_LAYER',
      realityValid: true,
      riskVeto: false,
      simulationPassed: true,
    });
  });

  it('downgrades to NEUTRAL when conviction or quality is insufficient', () => {
    const truth = deriveSystemTruth({
      pDecisionAbove: 0.56,
      confidence: 24,
      dataQuality: 0.5,
      flowToxicity: 10,
      realizedVol: 10,
      roundPhase: 'open',
    });

    assert.equal(truth.currentBelief.direction, 'NEUTRAL');
    assert.equal(truth.executionAllowed, false);
    assert.equal(truth.authority.simulationPassed, false);
  });

  it('locks execution when risk crosses HIGH or CRITICAL thresholds', () => {
    assert.equal(mapRiskLevel(0.35), 'MEDIUM');
    assert.equal(mapRiskLevel(0.55), 'HIGH');
    assert.equal(mapRiskLevel(0.75), 'CRITICAL');

    const truth = deriveSystemTruth({
      pDecisionAbove: 0.78,
      confidence: 91,
      dataQuality: 0.95,
      flowToxicity: 76,
      realizedVol: 35,
      roundPhase: 'closing',
    });

    assert.equal(deriveRiskScalar({ flowToxicity: 76, realizedVol: 35 }), 0.76);
    assert.equal(truth.riskLevel, 'CRITICAL');
    assert.equal(truth.executionAllowed, false);
    assert.equal(truth.authority.riskVeto, true);
  });

  it('retries stale responses only once', () => {
    assert.equal(shouldRetryStale({ stale: true }, 0), true);
    assert.equal(shouldRetryStale({ stale: true }, 1), false);
    assert.equal(shouldRetryStale({ stale: false }, 0), false);
  });
});
