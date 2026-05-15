export interface ShadowScenario {
  type: 'ACTUAL' | 'INVERSE' | 'NO_TRADE' | 'BEST_ALTERNATIVE';
  direction?: 'ABOVE' | 'BELOW';
}

export interface ShadowResult {
  actual: {
    pnl: number;
    outcome: boolean;
  };
  inverse: {
    pnl: number;
    outcome: boolean;
  };
  noTrade: {
    pnl: number;
  };
  bestAlternative: {
    pnl: number;
    outcome: boolean;
  };
  regretScore: number;
  efficiencyScore: number;
}

export function simulateShadow(
  actualDirection: 'ABOVE' | 'BELOW',
  actualProbability: number,
  payout: number,
  loss: number,
  actualOutcome: boolean
): ShadowResult {
  // Actual trade
  const actualPnl = actualOutcome ? payout : -loss;
  
  // Inverse trade
  const inverseDirection = actualDirection === 'ABOVE' ? 'BELOW' : 'ABOVE';
  const inverseOutcome = !actualOutcome;
  const inversePnl = inverseOutcome ? payout : -loss;
  
  // No trade
  const noTradePnl = 0;
  
  // Best alternative (max of actual, inverse, no trade)
  const bestPnl = Math.max(actualPnl, inversePnl, noTradePnl);
  const bestOutcome = bestPnl === actualPnl ? actualOutcome : bestPnl === inversePnl ? inverseOutcome : true;
  
  // Regret score (difference between best and actual)
  const regretScore = bestPnl - actualPnl;
  
  // Efficiency score (actual / best, normalized to 0-1)
  const efficiencyScore = bestPnl > 0 ? Math.max(0, actualPnl / bestPnl) : 1;
  
  return {
    actual: {
      pnl: actualPnl,
      outcome: actualOutcome,
    },
    inverse: {
      pnl: inversePnl,
      outcome: inverseOutcome,
    },
    noTrade: {
      pnl: noTradePnl,
    },
    bestAlternative: {
      pnl: bestPnl,
      outcome: bestOutcome,
    },
    regretScore,
    efficiencyScore,
  };
}

export interface ShadowHistory {
  timestamp: number;
  direction: 'ABOVE' | 'BELOW';
  probability: number;
  outcome: boolean;
  shadowResult: ShadowResult;
}

export function computeAggregateShadowMetrics(history: ShadowHistory[]): {
  avgRegret: number;
  avgEfficiency: number;
  winRate: number;
  inverseWinRate: number;
  noTradeVsActual: number;
} {
  if (history.length === 0) {
    return {
      avgRegret: 0,
      avgEfficiency: 0,
      winRate: 0,
      inverseWinRate: 0,
      noTradeVsActual: 0,
    };
  }
  
  const totalRegret = history.reduce((sum, h) => sum + h.shadowResult.regretScore, 0);
  const totalEfficiency = history.reduce((sum, h) => sum + h.shadowResult.efficiencyScore, 0);
  const wins = history.filter(h => h.shadowResult.actual.outcome).length;
  const inverseWins = history.filter(h => h.shadowResult.inverse.outcome).length;
  const noTradeBetter = history.filter(h => h.shadowResult.noTrade.pnl > h.shadowResult.actual.pnl).length;
  
  return {
    avgRegret: totalRegret / history.length,
    avgEfficiency: totalEfficiency / history.length,
    winRate: wins / history.length,
    inverseWinRate: inverseWins / history.length,
    noTradeVsActual: noTradeBetter / history.length,
  };
}
