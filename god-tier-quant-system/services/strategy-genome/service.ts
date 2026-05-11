import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { StrategyGenomeUpdateEvent } from '../../core/schemas/events.js';

interface GenomeState {
  strategyId: string;
  trades: number;
  fitness: number;
  stability: number;
  mutationRate: number;
  lifecycle: 'birth' | 'growth' | 'maturity' | 'decay' | 'extinction';
}

export class StrategyGenomeService {
  private readonly genomes = new Map<string, GenomeState>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<{ strategyId: string; pnl: number }>(EVENTS.RECONCILIATION, (event) => {
      if (!event.strategyId) {
        return;
      }
      const current = this.genomes.get(event.strategyId) ?? {
        strategyId: event.strategyId,
        trades: 0,
        fitness: 0,
        stability: 1,
        mutationRate: 0.08,
        lifecycle: 'birth',
      };

      current.trades += 1;
      const reward = clamp((event.pnl + 1) / 2, 0, 1);
      current.fitness = clamp(current.fitness * 0.85 + reward * 0.15, 0, 1);
      const volatilityPenalty = Math.min(1, Math.abs(event.pnl) / 5);
      current.stability = clamp(current.stability * 0.9 + (1 - volatilityPenalty) * 0.1, 0, 1);
      current.mutationRate = clamp(0.04 + (1 - current.stability) * 0.25 + (1 - current.fitness) * 0.2, 0.02, 0.45);
      current.lifecycle = deriveLifecycle(current);

      this.genomes.set(current.strategyId, current);
      this.publish();
    });
  }

  private publish(): void {
    const all = [...this.genomes.values()].sort((a, b) => b.fitness - a.fitness);
    const topGenomes = all.slice(0, 8).map((item) => ({
      strategyId: item.strategyId,
      fitness: Number(item.fitness.toFixed(4)),
      stability: Number(item.stability.toFixed(4)),
      mutationRate: Number(item.mutationRate.toFixed(4)),
      lifecycle: item.lifecycle,
    }));
    const retiring = all
      .filter((item) => item.lifecycle === 'extinction')
      .map((item) => item.strategyId)
      .slice(0, 5);

    const payload: StrategyGenomeUpdateEvent = {
      timestamp: Date.now(),
      topGenomes,
      retiring,
    };

    this.bus.emit(EVENTS.STRATEGY_GENOME_UPDATE, payload);
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'organism.genome.population',
      value: all.length,
      timestamp: payload.timestamp,
    });
  }
}

function deriveLifecycle(state: GenomeState): GenomeState['lifecycle'] {
  if (state.trades <= 3) {
    return 'birth';
  }
  if (state.fitness >= 0.72 && state.stability >= 0.65) {
    return 'maturity';
  }
  if (state.fitness >= 0.52) {
    return 'growth';
  }
  if (state.fitness < 0.25 || state.stability < 0.2) {
    return 'extinction';
  }
  return 'decay';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
