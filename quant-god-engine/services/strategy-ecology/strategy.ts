import { ProbabilityEvent, StrategySignal } from '../../core/schemas/events.js';

export interface StrategyStats {
  ev: number;
  sharpe: number;
  drawdown: number;
  calibrationAccuracy: number;
  variance: number;
}

export interface Strategy {
  id: string;
  evaluate(input: ProbabilityEvent): StrategySignal;
  stats(): StrategyStats;
  updateStats(realizedPnl: number): void;
}
