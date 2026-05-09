import { AnalystReport } from '../../core/index.js';
import { MarketObservation } from './market-observer.js';

export function generateNarrative(observation: MarketObservation): AnalystReport {
  const confidenceBand =
    Math.abs(observation.signalScore) > 70
      ? 'high'
      : Math.abs(observation.signalScore) > 40
      ? 'medium'
      : 'low';

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
