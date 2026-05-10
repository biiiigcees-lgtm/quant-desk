import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  ConstitutionalDecisionEvent,
  ExecutionPlan,
  ExecutionStateEvent,
  OrderEvent,
  RiskDecision,
} from '../../core/schemas/events.js';

export class ExecutionIntelligenceEngine {
  private readonly idempotency = new Map<string, number>();
  private readonly states = new Map<string, ExecutionStateEvent>();
  private readonly idempotencyTtlMs = 60 * 60 * 1000;
  private aiExecutionAdvisory: {
    orderStyle: 'market' | 'passive' | 'sliced';
    slices: number;
    expectedSlippage: number;
    fillProbability: number;
    confidence: number;
  } | null = null;

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on(
      EVENTS.AI_AGGREGATED_INTELLIGENCE,
      (event: {
        execution_recommendation?: {
          orderStyle?: 'market' | 'passive' | 'sliced';
          slices?: number;
          expectedSlippage?: number;
          fillProbability?: number;
          confidence?: number;
        };
      }) => {
        const exec = event.execution_recommendation;
        if (!exec) {
          return;
        }
        this.aiExecutionAdvisory = {
          orderStyle: exec.orderStyle === 'passive' || exec.orderStyle === 'sliced' ? exec.orderStyle : 'market',
          slices: Math.max(1, Math.min(10, Number(exec.slices ?? 1))),
          expectedSlippage: Math.max(0, Math.min(1, Number(exec.expectedSlippage ?? 0.01))),
          fillProbability: Math.max(0, Math.min(1, Number(exec.fillProbability ?? 0.5))),
          confidence: Math.max(0, Math.min(1, Number(exec.confidence ?? 0))),
        };
      },
    );

    this.bus.on<ConstitutionalDecisionEvent>(EVENTS.CONSTITUTIONAL_DECISION, (decision) => {
      this.handleConstitutionalDecision(decision);
    });

    this.bus.on<RiskDecision>(EVENTS.RISK_DECISION, (decision) => {
      this.handleRiskDecision(decision);
    });

    this.bus.on<OrderEvent>(EVENTS.ORDER_EVENT, (order) => {
      this.handleOrderEvent(order);
    });
  }

  private pruneIdempotency(nowMs: number = Date.now()): void {
    const cutoff = nowMs - this.idempotencyTtlMs;
    for (const [key, ts] of this.idempotency.entries()) {
      if (ts < cutoff) {
        this.idempotency.delete(key);
      }
    }
  }

  private handleConstitutionalDecision(decision: ConstitutionalDecisionEvent): void {
    this.pruneIdempotency();
    const executionId = `exec-${decision.contractId}-${decision.cycle_id}`;
    if (!decision.trade_allowed || decision.execution_mode === 'blocked') {
      this.publishState({
        executionId,
        contractId: decision.contractId,
        phase: 'blocked',
        reason: 'constitutional-block',
        safetyMode: 'hard-stop',
        timestamp: Date.now(),
      });
      return;
    }

    const dedupeKey = `${decision.contractId}:${decision.cycle_id}`;
    if (this.idempotency.has(dedupeKey)) {
      return;
    }
    this.idempotency.set(dedupeKey, Date.now());

    const direction = decision.final_probability >= 0.5 ? 'YES' : 'NO';
    const safetyMode = decision.risk_level >= 75 ? 'safe-mode' : 'normal';
    const baselineSize = 150 * Math.max(0.02, Math.abs(decision.edge_score)) * Math.max(0.1, decision.confidence_score);
    const size = clamp(baselineSize, 5, 800);
    const limitPrice = clamp(decision.final_probability, 0.01, 0.99);

    let orderStyle: ExecutionPlan['orderStyle'] = decision.execution_mode === 'passive' ? 'passive' : 'market';
    if (this.aiExecutionAdvisory && this.aiExecutionAdvisory.confidence >= 0.55) {
      orderStyle = this.aiExecutionAdvisory.orderStyle;
    }

    const slices = this.resolveSlices(orderStyle);
    const slippage = this.resolveSlippage(orderStyle);
    const fillProbability = this.resolveFillProbability(orderStyle);

    const plan: ExecutionPlan = {
      executionId,
      contractId: decision.contractId,
      direction,
      orderStyle,
      slices,
      expectedSlippage: slippage,
      fillProbability,
      limitPrice,
      size,
      latencyBudgetMs: this.resolveLatencyBudget(orderStyle, safetyMode),
      routeReason: 'constitutional-decision',
      safetyMode,
      timestamp: Date.now(),
    };

    this.emitPlanLifecycle(plan, 'constitutional-created');
  }

  private handleRiskDecision(decision: RiskDecision): void {
    this.pruneIdempotency();
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
    if (this.idempotency.has(dedupeKey)) {
      return;
    }
    this.idempotency.set(dedupeKey, Date.now());

    const plan = this.buildPlanFromRiskDecision(decision, executionId);
    this.emitPlanLifecycle(plan, plan.routeReason);
  }

  private buildPlanFromRiskDecision(decision: RiskDecision, executionId: string): ExecutionPlan {
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

    const baselineSlippage = this.resolveBaselineSlippage(orderStyle);
    const baselineFillProbability = this.resolveBaselineFillProbability(orderStyle);
    if (this.aiExecutionAdvisory && this.aiExecutionAdvisory.confidence >= 0.55 && decision.safetyMode !== 'hard-stop') {
      orderStyle = this.aiExecutionAdvisory.orderStyle;
    }

    const slices = this.resolveSlices(orderStyle);
    const expectedSlippage = this.aiExecutionAdvisory
      ? clamp((baselineSlippage + this.aiExecutionAdvisory.expectedSlippage) / 2, 0.001, 1)
      : baselineSlippage;
    const fillProbability = this.aiExecutionAdvisory
      ? clamp((baselineFillProbability + this.aiExecutionAdvisory.fillProbability) / 2, 0.01, 1)
      : baselineFillProbability;

    return {
      executionId,
      contractId: decision.contractId,
      direction: decision.direction,
      orderStyle,
      slices,
      expectedSlippage,
      fillProbability,
      limitPrice: decision.limitPrice,
      size: decision.size,
      latencyBudgetMs: this.resolveLatencyBudget(orderStyle, decision.safetyMode),
      routeReason: this.aiExecutionAdvisory ? `${routeReason}+ai-advisory` : routeReason,
      safetyMode: decision.safetyMode,
      timestamp: Date.now(),
    };
  }

  private handleOrderEvent(order: OrderEvent): void {
    const current = this.states.get(order.executionId);
    if (!current) {
      return;
    }
    const phase = this.phaseForOrderStatus(order.status);
    this.publishState({
      executionId: order.executionId,
      contractId: order.contractId,
      phase,
      reason: `order-${order.status}`,
      orderId: order.orderId,
      safetyMode: current.safetyMode,
      timestamp: order.timestamp,
    });
  }

  private emitPlanLifecycle(plan: ExecutionPlan, reason: string): void {
    this.publishState({
      executionId: plan.executionId,
      contractId: plan.contractId,
      phase: 'created',
      reason,
      safetyMode: plan.safetyMode,
      timestamp: plan.timestamp,
    });
    this.publishState({
      executionId: plan.executionId,
      contractId: plan.contractId,
      phase: 'submitted',
      reason: `submit-${plan.orderStyle}`,
      safetyMode: plan.safetyMode,
      timestamp: plan.timestamp,
    });
    this.bus.emit(EVENTS.EXECUTION_PLAN, plan);
  }

  private resolveSlices(orderStyle: ExecutionPlan['orderStyle']): number {
    if (this.aiExecutionAdvisory) {
      return clamp(this.aiExecutionAdvisory.slices, 1, 10);
    }
    if (orderStyle === 'sliced') {
      return 4;
    }
    return 1;
  }

  private resolveSlippage(orderStyle: ExecutionPlan['orderStyle']): number {
    if (this.aiExecutionAdvisory) {
      return clamp(this.aiExecutionAdvisory.expectedSlippage, 0.001, 1);
    }
    return this.resolveBaselineSlippage(orderStyle);
  }

  private resolveFillProbability(orderStyle: ExecutionPlan['orderStyle']): number {
    if (this.aiExecutionAdvisory) {
      return clamp(this.aiExecutionAdvisory.fillProbability, 0.01, 1);
    }
    return this.resolveBaselineFillProbability(orderStyle);
  }

  private resolveBaselineSlippage(orderStyle: ExecutionPlan['orderStyle']): number {
    if (orderStyle === 'market') {
      return 0.015;
    }
    if (orderStyle === 'sliced') {
      return 0.008;
    }
    return 0.004;
  }

  private resolveBaselineFillProbability(orderStyle: ExecutionPlan['orderStyle']): number {
    if (orderStyle === 'passive') {
      return 0.72;
    }
    return 0.93;
  }

  private resolveLatencyBudget(orderStyle: ExecutionPlan['orderStyle'], mode: ExecutionPlan['safetyMode']): number {
    if (mode === 'hard-stop') {
      return 25;
    }
    if (orderStyle === 'market') {
      return 60;
    }
    if (orderStyle === 'passive') {
      return 110;
    }
    return 80;
  }

  private phaseForOrderStatus(status: OrderEvent['status']): ExecutionStateEvent['phase'] {
    if (status === 'pending' || status === 'acknowledged') {
      return 'acknowledged';
    }
    if (status === 'filled') {
      return 'filled';
    }
    if (status === 'partial') {
      return 'partially_filled';
    }
    if (status === 'rejected') {
      return 'rejected';
    }
    if (status === 'expired') {
      return 'expired';
    }
    return 'cancelled';
  }

  private buildExecutionId(decision: RiskDecision): string {
    return `exec-${decision.contractId}-${decision.direction}-${Math.floor(decision.timestamp / 1000)}`;
  }

  private publishState(event: ExecutionStateEvent): void {
    this.states.set(event.executionId, event);
    this.bus.emit(EVENTS.EXECUTION_STATE, event);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
