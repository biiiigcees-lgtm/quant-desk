import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { ExecutionAlphaEvent, ExecutionPlan } from '../../core/schemas/events.js';

export class ExecutionAlphaService {
  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<ExecutionPlan>(EVENTS.EXECUTION_PLAN, (event) => {
      const payload: ExecutionAlphaEvent = {
        executionId: event.executionId,
        contractId: event.contractId,
        expectedFillQualityBps: Number((Math.max(0, 1 - event.expectedSlippage) * 12).toFixed(2)),
        expectedLatencyMs: Math.max(5, 120 - event.fillProbability * 80),
        latencyBudgetMs: event.latencyBudgetMs,
        routeReason: event.routeReason,
        safetyMode: event.safetyMode,
        timestamp: event.timestamp,
      };

      this.bus.emit(EVENTS.EXECUTION_ALPHA, payload);
    });
  }
}
