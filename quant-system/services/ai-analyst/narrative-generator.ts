import { AnalystReport } from '../../core/index.js';
import { MarketObservation } from './market-observer.js';

export function generateNarrative(observation: MarketObservation): AnalystReport {
  const absSignal = Math.abs(observation.signalScore);
  let confidenceBand: AnalystReport['confidenceBand'] = 'low';
  if (absSignal > 70) {
    confidenceBand = 'high';
  } else if (absSignal > 40) {
    confidenceBand = 'medium';
  }

  const summary =
    `Signal ${observation.signalDirection} at score ${observation.signalScore.toFixed(1)} ` +
    `with ${observation.agreement.toFixed(1)}% agreement. ` +
    `Exposure ${(observation.exposureRatio * 100).toFixed(1)}%, session PnL ${observation.sessionPnl.toFixed(2)}.`;

  return {
    contractId: observation.contractId,
    summary,
    confidenceBand,
    timestamp: Date.now(),
  };
}
