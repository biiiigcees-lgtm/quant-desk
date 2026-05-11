import { AggregatedSignal, PortfolioState, TradingConfig } from '../../core/index.js';

export interface RuleResult {
  approved: boolean;
  reason: string;
}

export function validateSignalThresholds(
  signal: AggregatedSignal,
  trading: TradingConfig,
): RuleResult {
  const absScore = Math.abs(signal.score);
  if (signal.finalSignal === 'FLAT') {
    return { approved: false, reason: 'Signal is FLAT' };
  }
  if (absScore < trading.minScore) {
    return { approved: false, reason: 'Score below threshold' };
  }
  if (signal.agreement / 100 < trading.minAgreement) {
    return { approved: false, reason: 'Strategy agreement below threshold' };
  }
  return { approved: true, reason: 'Signal thresholds passed' };
}

export function validateRiskLimits(
  portfolio: PortfolioState,
  trading: TradingConfig,
): RuleResult {
  const dd = portfolio.peakBank > 0 ? (portfolio.peakBank - portfolio.bank) / portfolio.peakBank : 0;
  if (portfolio.dailyPnL <= -Math.abs(trading.maxDailyLoss)) {
    return { approved: false, reason: 'Daily loss limit exceeded' };
  }
  if (dd > 0.2) {
    return { approved: false, reason: 'Drawdown kill switch triggered' };
  }
  return { approved: true, reason: 'Risk limits passed' };
}
