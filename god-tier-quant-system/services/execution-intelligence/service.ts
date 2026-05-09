import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { ExecutionPlan, ExecutionStateEvent, OrderEvent, RiskDecision } from '../../core/schemas/events.js';

export class ExecutionIntelligenceEngine {
  private readonly idempotency = new Set<string>();
  private readonly states = new Map<string, ExecutionStateEvent>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<RiskDecision>(EVENTS.RISK_DECISION, (decision) => {
      const executionId = this.buildExecutionId(decision);
      if (!decision.approved || decision.size <= 0) {
        this.publishState({
          executionId,
          contractId: decision.contractId,
          phase: 'blocked',
          reason: decision.reason,
          safetyMode: decision.safetyMode,
          timestamp: Date.now(),
        });
        return;
      }

      const dedupeKey = `${decision.contractId}:${decision.direction}:${Math.floor(decision.timestamp / 1000)}`;
      if (this.idempotency.has(dedupeKey)) return;
      this.idempotency.add(dedupeKey);

      let orderStyle: ExecutionPlan['orderStyle'] = 'market';
      let routeReason = 'baseline-market';
      if (decision.ruinProbability > 0.15) {
        orderStyle = 'passive';
        routeReason = 'ruin-probability-protective-passive';
      } else if (decision.size > 500) {
        orderStyle = 'sliced';
        routeReason = 'large-size-sliced';
      } else if (decision.safetyMode === 'safe-mode') {
        orderStyle = 'passive';
        routeReason = 'safe-mode-passive';
      }
      const slices = orderStyle === 'sliced' ? 4 : 1;
      let expectedSlippage = 0.004;
      if (orderStyle === 'market') {
        expectedSlippage = 0.015;
      } else if (orderStyle === 'sliced') {
        expectedSlippage = 0.008;
      }
      const fillProbability = orderStyle === 'passive' ? 0.72 : 0.93;
      const latencyBudgetMs = decision.safetyMode === 'hard-stop' ? 25 : orderStyle === 'market' ? 60 : orderStyle === 'passive' ? 110 : 80;

      const plan: ExecutionPlan = {
        executionId,
        contractId: decision.contractId,
        direction: decision.direction,
        orderStyle,
        slices,
        expectedSlippage,
        fillProbability,
        limitPrice: decision.limitPrice,
        size: decision.size,
        latencyBudgetMs,
        routeReason,
        safetyMode: decision.safetyMode,
        timestamp: Date.now(),
      };

      this.publishState({
        executionId,
        contractId: decision.contractId,
        phase: 'created',
        reason: routeReason,
        safetyMode: decision.safetyMode,
        timestamp: plan.timestamp,
      });
      this.bus.emit(EVENTS.EXECUTION_PLAN, plan);
      this.publishState({
        executionId,
        contractId: decision.contractId,
        phase: 'routed',
        reason: orderStyle,
        safetyMode: decision.safetyMode,
        timestamp: plan.timestamp,
      });
    });

    this.bus.on<OrderEvent>(EVENTS.ORDER_EVENT, (order) => {
      const current = this.states.get(order.executionId);
      if (!current) return;
      const phase = order.status === 'filled' ? 'filled' : order.status === 'partial' ? 'partial' : order.status === 'rejected' ? 'rejected' : 'cancelled';
      this.publishState({
        executionId: order.executionId,
        contractId: order.contractId,
        phase,
        reason: `order-${order.status}`,
        orderId: order.orderId,
        safetyMode: current.safetyMode,
        timestamp: order.timestamp,
      });
    });
  }

  private buildExecutionId(decision: RiskDecision): string {
    return `exec-${decision.contractId}-${decision.direction}-${Math.floor(decision.timestamp / 1000)}`;
  }

  private publishState(event: ExecutionStateEvent): void {
    this.states.set(event.executionId, event);
    this.bus.emit(EVENTS.EXECUTION_STATE, event);
  }
}
