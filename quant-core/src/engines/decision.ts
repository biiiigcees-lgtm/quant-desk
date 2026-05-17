import { Signals, Whale, NoiseOutput, DecisionOutput, BayesOutput } from '../types/market';

export function noiseFilter(
  signals: Signals,
  whales: Whale[],
  regime: string
): NoiseOutput {
  let noise = 0;
  if (whales.length > 5) noise += 0.2;
  if (regime === 'CHOPPY') noise += 0.3;
  if (signals.volatilitySpike) noise += 0.2;
  return { noiseLevel: Math.min(1, noise), cleanSignal: noise < 0.5 };
}

export function decisionEngine(
  bayes: BayesOutput,
  noise: NoiseOutput
): DecisionOutput {
  const adjProb = bayes.probabilityLong * (1 - noise.noiseLevel);
  let decision: 'LONG' | 'SHORT' | 'NO_TRADE';
  if (adjProb > 0.6) {
    decision = 'LONG';
  } else if (adjProb < 0.4) {
    decision = 'SHORT';
  } else {
    decision = 'NO_TRADE';
  }
  return { decision, confidence: Math.round(adjProb * 100) };
}
