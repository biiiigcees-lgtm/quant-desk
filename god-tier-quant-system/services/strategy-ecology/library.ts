import { ProbabilityEvent, StrategyLifecyclePhase, StrategySignal } from '../../core/schemas/events.js';
import { Strategy, StrategyStats } from './strategy.js';

class BaseStrategy implements Strategy {
  protected metrics = { ev: 0.01, sharpe: 1, drawdown: 0.01, calibrationAccuracy: 0.6, variance: 0.02 };
  public lifecyclePhase: StrategyLifecyclePhase = 'birth';

  constructor(public readonly id: string, private readonly style: 'momentum' | 'mean-reversion' | 'liquidity-sweep' | 'time-decay' | 'panic-fade' | 'vacuum') {}

  evaluate(input: ProbabilityEvent): StrategySignal {
    const edge = input.edge;
    let direction: 'YES' | 'NO' | 'FLAT' = 'FLAT';

    if (this.style === 'mean-reversion' || this.style === 'panic-fade') {
      if (edge > 0.015) direction = 'NO';
      if (edge < -0.015) direction = 'YES';
    } else {
      if (edge > 0.012) direction = 'YES';
      if (edge < -0.012) direction = 'NO';
    }

    if (input.regime === 'panic' && this.style !== 'panic-fade') direction = 'FLAT';
    if (input.regime === 'low-liquidity' && this.style === 'liquidity-sweep') direction = 'YES';

    const confidence = Math.max(0, Math.min(1, Math.abs(edge) * 12));

    return {
      strategyId: this.id,
      contractId: input.contractId,
      direction,
      confidence,
      expectedValue: Math.abs(edge) * confidence,
      regime: input.regime,
      rationale: `style=${this.style}, edge=${edge.toFixed(4)}`,
      timestamp: input.timestamp,
    };
  }

  stats(): StrategyStats {
    return this.metrics;
  }

  updateStats(realizedPnl: number): void {
    this.metrics.ev = this.metrics.ev * 0.95 + realizedPnl * 0.05;
    this.metrics.sharpe = Math.max(0.1, this.metrics.sharpe * 0.98 + (realizedPnl > 0 ? 0.03 : -0.02));
    this.metrics.drawdown = Math.max(0.001, this.metrics.drawdown * 0.99 + (realizedPnl < 0 ? 0.01 : -0.005));
    this.metrics.calibrationAccuracy = Math.max(0.2, Math.min(0.95, this.metrics.calibrationAccuracy + (realizedPnl > 0 ? 0.01 : -0.01)));
    this.metrics.variance = Math.max(0.001, this.metrics.variance * 0.99 + Math.abs(realizedPnl) * 0.01);
  }

  setLifecycle(phase: StrategyLifecyclePhase): void {
    this.lifecyclePhase = phase;
  }
}

export function createDefaultStrategies(): Strategy[] {
  return [
    new BaseStrategy('momentum', 'momentum'),
    new BaseStrategy('mean-reversion', 'mean-reversion'),
    new BaseStrategy('liquidity-sweep', 'liquidity-sweep'),
    new BaseStrategy('time-decay', 'time-decay'),
    new BaseStrategy('panic-fade', 'panic-fade'),
    new BaseStrategy('liquidity-vacuum', 'vacuum'),
  ];
}
