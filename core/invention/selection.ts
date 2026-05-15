import { StrategyGenome, PerformanceMetrics } from './genome';

export function selectTopPerformers(population: StrategyGenome[], count: number): StrategyGenome[] {
  return population
    .sort((a, b) => b.performance.fitness - a.performance.fitness)
    .slice(0, count);
}

export function computeFitness(metrics: PerformanceMetrics): number {
  if (metrics.totalTrades === 0) return 0.5;
  
  const winRateWeight = 0.4;
  const sharpeWeight = 0.3;
  const pnlWeight = 0.2;
  const drawdownWeight = 0.1;
  
  const winRateScore = metrics.winRate;
  const sharpeScore = Math.min(metrics.sharpeRatio / 2, 1);
  const pnlScore = metrics.totalPnL > 0 ? Math.min(metrics.totalPnL / 1000, 1) : 0;
  const drawdownScore = 1 - Math.min(metrics.maxDrawdown / 0.2, 1);
  
  return (
    winRateScore * winRateWeight +
    sharpeScore * sharpeWeight +
    pnlScore * pnlWeight +
    drawdownScore * drawdownWeight
  );
}

export function updatePerformance(genome: StrategyGenome, pnl: number, outcome: boolean): StrategyGenome {
  const updated = { ...genome };
  updated.performance.totalTrades++;
  if (outcome) {
    updated.performance.wins++;
  } else {
    updated.performance.losses++;
  }
  updated.performance.winRate = updated.performance.wins / updated.performance.totalTrades;
  updated.performance.totalPnL += pnl;
  updated.performance.avgPnL = updated.performance.totalPnL / updated.performance.totalTrades;
  
  // Update max drawdown (simplified)
  if (updated.performance.totalPnL < updated.performance.maxDrawdown) {
    updated.performance.maxDrawdown = updated.performance.totalPnL;
  }
  
  // Simplified Sharpe ratio
  updated.performance.sharpeRatio = updated.performance.avgPnL / (Math.abs(updated.performance.avgPnL) + 1);
  
  updated.performance.fitness = computeFitness(updated.performance);
  updated.lastUpdated = Date.now();
  
  return updated;
}
