import { AggregatedSignal, PortfolioState } from '../../core/index.js';

export interface MarketObservation {
  contractId: string;
  signalDirection: 'YES' | 'NO' | 'FLAT';
  signalScore: number;
  agreement: number;
  exposureRatio: number;
  sessionPnl: number;
}

export function observeMarket(
  signal: AggregatedSignal,
  portfolio: PortfolioState,
): MarketObservation {
  const exposureRatio = portfolio.bank > 0 ? portfolio.currentExposure / portfolio.bank : 0;

  return {
    contractId: signal.contractId,
    signalDirection: signal.finalSignal,
    signalScore: signal.score,
    agreement: signal.agreement,
    exposureRatio,
    sessionPnl: portfolio.sessionPnL,
  };
}
