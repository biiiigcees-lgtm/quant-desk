import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { AggregatedSignal, SimulationUniverseEvent, StrategySignal, ValidationResultEvent } from '../../core/schemas/events.js';

export class SimulationUniverseService {
  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<StrategySignal>(EVENTS.STRATEGY_SIGNAL, (signal) => {
      const walkForwardScore = Number((signal.confidence * 100 - Math.abs(signal.expectedValue) * 40).toFixed(2));
      let walkForwardStatus: ValidationResultEvent['status'];
      if (walkForwardScore >= 45 && signal.confidence >= 0.55) {
        walkForwardStatus = 'pass';
      } else if (walkForwardScore >= 25) {
        walkForwardStatus = 'hold';
      } else {
        walkForwardStatus = 'fail';
      }

      this.bus.emit(EVENTS.VALIDATION_RESULT, {
        contractId: signal.contractId,
        strategyId: signal.strategyId,
        kind: 'walk-forward',
        status: walkForwardStatus,
        score: walkForwardScore,
        details: `confidence=${signal.confidence.toFixed(3)} expectedValue=${signal.expectedValue.toFixed(4)}`,
        timestamp: signal.timestamp,
      } satisfies ValidationResultEvent);

      let adversarialPenalty: number;
      if (signal.regime === 'panic') {
        adversarialPenalty = 30;
      } else if (signal.regime === 'low-liquidity') {
        adversarialPenalty = 18;
      } else {
        adversarialPenalty = 8;
      }
      const adversarialScore = Number((signal.confidence * 100 - adversarialPenalty).toFixed(2));
      let adversarialStatus: ValidationResultEvent['status'];
      if (adversarialScore >= 40 && signal.expectedValue > 0.01) {
        adversarialStatus = 'pass';
      } else if (adversarialScore >= 20) {
        adversarialStatus = 'hold';
      } else {
        adversarialStatus = 'fail';
      }

      this.bus.emit(EVENTS.VALIDATION_RESULT, {
        contractId: signal.contractId,
        strategyId: signal.strategyId,
        kind: 'adversarial',
        status: adversarialStatus,
        score: adversarialScore,
        details: `regime=${signal.regime} penalty=${adversarialPenalty}`,
        timestamp: signal.timestamp,
      } satisfies ValidationResultEvent);
    });

    this.bus.on<AggregatedSignal>(EVENTS.AGGREGATED_SIGNAL, (event) => {
      const scenarioCount = 256;
      const tailProbability = Number(Math.max(0.01, 1 - event.agreement).toFixed(4));
      const worstCasePnl = Number((-Math.abs(event.score) * 220 * tailProbability).toFixed(2));

      const payload: SimulationUniverseEvent = {
        scenarioCount,
        worstCasePnl,
        tailProbability,
        timestamp: event.timestamp,
      };

      this.bus.emit(EVENTS.SIMULATION_UNIVERSE, payload);
    });
  }
}
