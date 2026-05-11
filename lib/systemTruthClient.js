export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function getDirectionalDecision(input = {}) {
  const quality = Number.isFinite(input.dataQuality) ? input.dataQuality : 1;
  const pDecisionAbove = Number.isFinite(input.pDecisionAbove) ? input.pDecisionAbove : input.pAbove;
  const boundedDecisionAbove = Number.isFinite(pDecisionAbove) ? pDecisionAbove : 0.5;
  const directionalEdge = Math.abs(boundedDecisionAbove - 0.5) * 2;
  const roundPhase = input.roundPhase ?? 'open';
  const confidence = Number.isFinite(input.confidence) ? input.confidence : 0;
  const confThreshold = roundPhase === 'closing' ? 50 : 35;
  const edgeThreshold = roundPhase === 'closing' ? 0.12 : 0.08;
  const secureDecision = confidence >= confThreshold && quality >= 0.65 && directionalEdge >= edgeThreshold;
  const verdict = boundedDecisionAbove >= 0.5 ? 'ABOVE' : 'BELOW';

  return {
    verdict,
    secureDecision,
    directionalEdge,
    quality,
    confidence,
  };
}

export function deriveRiskScalar(input = {}) {
  const flowRisk = Number.isFinite(input.flowToxicity) ? input.flowToxicity / 100 : 0;
  const volatilityRisk = Number.isFinite(input.realizedVol) ? clamp(input.realizedVol / 120, 0, 1) : 0;
  return clamp(Math.max(flowRisk, volatilityRisk), 0, 1);
}

export function mapRiskLevel(riskScalar) {
  const risk = clamp(riskScalar, 0, 1);
  if (risk >= 0.75) return 'CRITICAL';
  if (risk >= 0.55) return 'HIGH';
  if (risk >= 0.35) return 'MEDIUM';
  return 'LOW';
}

export function deriveSystemTruth(input = {}) {
  const decision = getDirectionalDecision(input);
  const riskScalar = deriveRiskScalar(input);
  const riskLevel = mapRiskLevel(riskScalar);
  const realityValid = decision.quality >= 0.65;
  const riskVeto = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
  const simulationPassed = decision.secureDecision;
  let direction = 'NEUTRAL';
  if (decision.secureDecision) {
    direction = decision.verdict === 'ABOVE' ? 'UP' : 'DOWN';
  }
  const authority = {
    source: 'COGNITION_LAYER',
    realityValid,
    riskVeto,
    simulationPassed,
  };

  return {
    currentBelief: {
      direction,
      confidence: Number(clamp(decision.confidence, 0, 100).toFixed(2)),
    },
    executionAllowed: direction !== 'NEUTRAL' && authority.realityValid && !authority.riskVeto && authority.simulationPassed,
    riskLevel,
    authority,
    riskScalar: Number(riskScalar.toFixed(4)),
    secureDecision: decision.secureDecision,
    verdict: decision.verdict,
  };
}

export function shouldRetryStale(response, attempt) {
  return Boolean(response?.stale) && attempt === 0;
}
