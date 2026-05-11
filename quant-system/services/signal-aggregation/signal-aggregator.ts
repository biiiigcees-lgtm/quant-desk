import { AggregatedSignal, StrategySignal } from '../../core/index.js';

export interface WeightedStrategySignal extends StrategySignal {
  contractId: string;
}

export interface AggregationWeights {
  [strategyName: string]: number;
}

export function aggregateSignals(
  contractId: string,
  signals: WeightedStrategySignal[],
  weights: AggregationWeights,
  timestamp: number,
): AggregatedSignal {
  const actionable = signals.filter((s) => s.direction !== 'FLAT');

  if (actionable.length === 0) {
    return {
      contractId,
      finalSignal: 'FLAT',
      score: 0,
      regime: 'neutral',
      agreement: 0,
      signals,
      timestamp,
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let yesWeight = 0;
  let noWeight = 0;

  for (const signal of actionable) {
    const strategyWeight = Math.max(0, weights[signal.strategyName] ?? 0.25);
    const confidenceWeight = Math.max(0, Math.min(1, signal.confidence));
    const effectiveWeight = strategyWeight * confidenceWeight;

    totalWeight += effectiveWeight;

    if (signal.direction === 'YES') {
      yesWeight += effectiveWeight;
      weightedSum += effectiveWeight;
    } else if (signal.direction === 'NO') {
      noWeight += effectiveWeight;
      weightedSum -= effectiveWeight;
    }
  }

  const normalized = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const score = normalized * 100;

  let finalSignal: 'YES' | 'NO' | 'FLAT' = 'FLAT';
  if (score > 10) {
    finalSignal = 'YES';
  } else if (score < -10) {
    finalSignal = 'NO';
  }

  const agreement = totalWeight > 0 ? (Math.max(yesWeight, noWeight) / totalWeight) * 100 : 0;

  const regimeVotes: Record<string, number> = {};
  for (const signal of actionable) {
    regimeVotes[signal.regime] = (regimeVotes[signal.regime] ?? 0) + 1;
  }
  const regime =
    Object.entries(regimeVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral';

  return {
    contractId,
    finalSignal,
    score,
    regime,
    agreement,
    signals,
    timestamp,
  };
}
