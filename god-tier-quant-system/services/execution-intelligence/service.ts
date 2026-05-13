import { EventBus } from '../../core/event-bus/bus.js';
import { ExecutionCoordinator } from '../../core/determinism/execution-coordinator.js';
import { LogicalClock, MonotonicLogicalClock } from '../../core/determinism/logical-clock.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  ConstitutionalDecisionEvent,
  ExecutionPlan,
  ExecutionStateEvent,
  MarketPhysicsEvent,
  MarketWorldStateEvent,
  MicrostructureEvent,
  OrderEvent,
  RiskDecision,
  ScenarioBranchStateEvent,
} from '../../core/schemas/events.js';

interface ExecutionSignals {
  scenarioInvalidated: boolean;
  predatoryBrake: boolean;
  absorptionAcceleration: boolean;
  forcedPositioningPressure: boolean;
  reflexivityAcceleration: boolean;
  authorityDecay: number;
}

interface ExecutionAdjustment extends ExecutionSignals {
  orderStyle: ExecutionPlan['orderStyle'];
  safetyMode: ExecutionPlan['safetyMode'];
  size: number;
}

interface RiskExecutionAdjustment extends ExecutionAdjustment {
  routeReason: string;
}

interface ExecutionParameters {
  slices: number;
  expectedSlippage: number;
  fillProbability: number;
  latencyBudgetMs: number;
}

export class ExecutionIntelligenceEngine {
  private readonly coordinator = new ExecutionCoordinator({
    leaseTtlMs: 5_000,
    idempotencyTtlMs: 30_000,
  });
  private readonly states = new Map<string, ExecutionStateEvent>();
  private readonly latestConstitutionalSnapshotSeq = new Map<string, number>();
  private readonly latestConstitutionalDecisionTs = new Map<string, number>();
  private readonly latestRiskDecisionTs = new Map<string, number>();
  private readonly latestMicro = new Map<string, MicrostructureEvent>();
  private readonly latestPhysics = new Map<string, MarketPhysicsEvent>();
  private readonly latestScenario = new Map<string, ScenarioBranchStateEvent>();
  private readonly latestWorld = new Map<string, MarketWorldStateEvent>();
  private readonly latestAuthorityDecay = new Map<string, number>();
  private latestAiExecutionAdvisoryTs = 0;
  private aiExecutionAdvisory: {
    orderStyle: 'market' | 'passive' | 'sliced';
    slices: number;
    expectedSlippage: number;
    fillProbability: number;
    confidence: number;
  } | null = null;

  constructor(private readonly bus: EventBus, private readonly clock: LogicalClock = new MonotonicLogicalClock()) {}

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
        timestamp?: number;
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
        this.latestAiExecutionAdvisoryTs = this.clock.observe(Number(event.timestamp ?? this.clock.tick()));
      },
    );

    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, (event) => {
      this.latestMicro.set(event.contractId, event);
    });

    this.bus.on<MarketPhysicsEvent>(EVENTS.MARKET_PHYSICS, (event) => {
      this.latestPhysics.set(event.contractId, event);
    });

    this.bus.on<ScenarioBranchStateEvent>(EVENTS.SCENARIO_BRANCH_STATE, (event) => {
      this.latestScenario.set(event.contractId, event);
    });

    this.bus.on<MarketWorldStateEvent>(EVENTS.MARKET_WORLD_STATE, (event) => {
      this.latestWorld.set(event.contractId, event);
    });

    this.bus.on(EVENTS.META_CALIBRATION, (event: { contractId: string; authorityDecay: number }) => {
      this.latestAuthorityDecay.set(event.contractId, clamp(event.authorityDecay, 0, 1));
    });

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

  private handleConstitutionalDecision(decision: ConstitutionalDecisionEvent): void {
    const decisionTime = this.clock.observe(decision.timestamp);
    const executionId = `exec-${decision.contractId}-${decision.cycle_id}`;
    if (this.shouldBlockConstitutionalDecision(decision, executionId, decisionTime)) {
      return;
    }

    const dedupeKey = `constitutional:${decision.contractId}:${decision.snapshot_id}`;
    const lease = this.coordinator.acquire(decision.contractId, dedupeKey, decisionTime);
    if (!lease.acquired) {
      if (lease.reason !== 'duplicate') {
        this.publishExecutionBlocked(
          executionId,
          decision.contractId,
          'execution-lock-contention',
          'safe-mode',
          decisionTime,
        );
      }
      return;
    }

    try {
      const plan = this.buildPlanFromConstitutionalDecision(decision, executionId, decisionTime);

      this.emitPlanLifecycle(plan, 'constitutional-created');
      this.coordinator.release(decision.contractId, lease.token ?? '', true);
    } catch (error) {
      this.coordinator.release(decision.contractId, lease.token ?? '', false);
      throw error;
    }
  }

  private handleRiskDecision(decision: RiskDecision): void {
    const decisionTime = this.clock.observe(decision.timestamp);
    const executionId = this.buildExecutionId(decision);
    if (!decision.approved || decision.size <= 0) {
      this.publishState({
        executionId,
        contractId: decision.contractId,
        phase: 'blocked',
        reason: decision.reason,
        safetyMode: decision.safetyMode,
        timestamp: decisionTime,
      });
      return;
    }

    const latestTs = this.latestRiskDecisionTs.get(decision.contractId);
    if (latestTs !== undefined && decision.timestamp < latestTs) {
      this.publishState({
        executionId,
        contractId: decision.contractId,
        phase: 'blocked',
        reason: 'stale-risk-decision',
        safetyMode: decision.safetyMode,
        timestamp: decisionTime,
      });
      return;
    }
    this.latestRiskDecisionTs.set(decision.contractId, decision.timestamp);

    const dedupeKey = [
      'risk',
      decision.contractId,
      decision.direction,
      decision.timestamp,
      decision.safetyMode,
      decision.limitPrice.toFixed(4),
      decision.size.toFixed(4),
    ].join(':');
    const lease = this.coordinator.acquire(decision.contractId, dedupeKey, decisionTime);
    if (!lease.acquired) {
      if (lease.reason === 'duplicate') {
        return;
      }
      this.publishState({
        executionId,
        contractId: decision.contractId,
        phase: 'blocked',
        reason: 'execution-lock-contention',
        safetyMode: decision.safetyMode,
        timestamp: decisionTime,
      });
      return;
    }

    try {
      const plan = this.buildPlanFromRiskDecision(decision, executionId);
      this.emitPlanLifecycle(plan, plan.routeReason);
      this.coordinator.release(decision.contractId, lease.token ?? '', true);
    } catch (error) {
      this.coordinator.release(decision.contractId, lease.token ?? '', false);
      throw error;
    }
  }

  private buildPlanFromRiskDecision(decision: RiskDecision, executionId: string): ExecutionPlan {
    const initialRouting = this.resolveInitialRiskRouting(decision);
    let orderStyle = initialRouting.orderStyle;
    if (this.hasFreshAiAdvisory(decision.timestamp) && decision.safetyMode !== 'hard-stop') {
      orderStyle = this.aiExecutionAdvisory?.orderStyle ?? orderStyle;
    }

    const baselineSlippage = this.resolveBaselineSlippage(orderStyle);
    const baselineFillProbability = this.resolveBaselineFillProbability(orderStyle);
    const adjustment = this.applyRiskExecutionAdjustment(
      decision,
      orderStyle,
      decision.safetyMode,
      decision.size,
      initialRouting.routeReason,
    );

    const blendedSlippage = this.aiExecutionAdvisory
      ? clamp((baselineSlippage + this.aiExecutionAdvisory.expectedSlippage) / 2, 0.001, 1)
      : baselineSlippage;
    const blendedFillProbability = this.aiExecutionAdvisory
      ? clamp((baselineFillProbability + this.aiExecutionAdvisory.fillProbability) / 2, 0.01, 1)
      : baselineFillProbability;
    const params = this.resolveExecutionParameters(
      adjustment.orderStyle,
      adjustment.safetyMode,
      blendedSlippage,
      blendedFillProbability,
      adjustment.predatoryBrake,
      adjustment.absorptionAcceleration,
      adjustment.reflexivityAcceleration,
    );

    return {
      executionId,
      contractId: decision.contractId,
      direction: decision.direction,
      orderStyle: adjustment.orderStyle,
      slices: params.slices,
      expectedSlippage: params.expectedSlippage,
      fillProbability: params.fillProbability,
      limitPrice: decision.limitPrice,
      size: adjustment.size,
      latencyBudgetMs: params.latencyBudgetMs,
      routeReason: this.aiExecutionAdvisory ? `${adjustment.routeReason}+ai-advisory` : adjustment.routeReason,
      safetyMode: adjustment.safetyMode,
      timestamp: this.clock.observe(decision.timestamp),
    };
  }

  private shouldBlockConstitutionalDecision(
    decision: ConstitutionalDecisionEvent,
    executionId: string,
    decisionTime: number,
  ): boolean {
    if (!decision.trade_allowed || decision.execution_mode === 'blocked') {
      this.publishExecutionBlocked(executionId, decision.contractId, 'constitutional-block', 'hard-stop', decisionTime);
      return true;
    }

    if (this.isStaleConstitutionalDecision(decision)) {
      this.publishExecutionBlocked(
        executionId,
        decision.contractId,
        'stale-constitutional-snapshot',
        'safe-mode',
        decisionTime,
      );
      return true;
    }

    return false;
  }

  private publishExecutionBlocked(
    executionId: string,
    contractId: string,
    reason: string,
    safetyMode: ExecutionPlan['safetyMode'],
    timestamp: number,
  ): void {
    this.publishState({
      executionId,
      contractId,
      phase: 'blocked',
      reason,
      safetyMode,
      timestamp,
    });
  }

  private buildPlanFromConstitutionalDecision(
    decision: ConstitutionalDecisionEvent,
    executionId: string,
    decisionTime: number,
  ): ExecutionPlan {
    const direction = decision.final_probability >= 0.5 ? 'YES' : 'NO';
    const initialSafetyMode: ExecutionPlan['safetyMode'] = decision.risk_level >= 75 ? 'safe-mode' : 'normal';
    const baselineSize = 150 * Math.max(0.02, Math.abs(decision.edge_score)) * Math.max(0.1, decision.confidence_score);
    const initialSize = clamp(baselineSize, 5, 800);
    let orderStyle: ExecutionPlan['orderStyle'] = decision.execution_mode === 'passive' ? 'passive' : 'market';
    if (this.hasFreshAiAdvisory(decision.timestamp)) {
      orderStyle = this.aiExecutionAdvisory?.orderStyle ?? orderStyle;
    }

    const adjustment = this.applyConstitutionalExecutionAdjustment(
      decision.contractId,
      orderStyle,
      initialSafetyMode,
      initialSize,
    );
    const params = this.resolveExecutionParameters(
      adjustment.orderStyle,
      adjustment.safetyMode,
      this.resolveSlippage(adjustment.orderStyle),
      this.resolveFillProbability(adjustment.orderStyle),
      adjustment.predatoryBrake,
      adjustment.absorptionAcceleration,
      adjustment.reflexivityAcceleration,
    );

    return {
      executionId,
      contractId: decision.contractId,
      direction,
      orderStyle: adjustment.orderStyle,
      slices: params.slices,
      expectedSlippage: params.expectedSlippage,
      fillProbability: params.fillProbability,
      limitPrice: clamp(decision.final_probability, 0.01, 0.99),
      size: adjustment.size,
      latencyBudgetMs: params.latencyBudgetMs,
      routeReason: this.resolveConstitutionalRouteReason(adjustment),
      safetyMode: adjustment.safetyMode,
      timestamp: decisionTime,
    };
  }

  private hasFreshAiAdvisory(timestamp: number): boolean {
    return Boolean(
      this.aiExecutionAdvisory
      && this.aiExecutionAdvisory.confidence >= 0.55
      && this.latestAiExecutionAdvisoryTs >= timestamp,
    );
  }

  private resolveInitialRiskRouting(decision: RiskDecision): {
    orderStyle: ExecutionPlan['orderStyle'];
    routeReason: string;
  } {
    if (decision.ruinProbability > 0.15) {
      return { orderStyle: 'passive', routeReason: 'ruin-probability-protective-passive' };
    }
    if (decision.size > 500) {
      return { orderStyle: 'sliced', routeReason: 'large-size-sliced' };
    }
    if (decision.safetyMode === 'safe-mode') {
      return { orderStyle: 'passive', routeReason: 'safe-mode-passive' };
    }
    return { orderStyle: 'market', routeReason: 'baseline-market' };
  }

  private readExecutionSignals(contractId: string, safetyMode: ExecutionPlan['safetyMode']): ExecutionSignals {
    const micro = this.latestMicro.get(contractId);
    const physics = this.latestPhysics.get(contractId);
    const scenario = this.latestScenario.get(contractId);
    const world = this.latestWorld.get(contractId);
    const authorityDecay = this.latestAuthorityDecay.get(contractId) ?? 0;

    return {
      scenarioInvalidated: Boolean(scenario?.invalidated),
      predatoryBrake:
        (micro?.toxicityScore ?? 0) > 0.75 ||
        (micro?.spoofProbability ?? 0) > 0.68 ||
        (physics?.structuralStress ?? 0) > 0.8,
      absorptionAcceleration:
        (micro?.absorptionScore ?? 0) > 0.72 &&
        !scenario?.invalidated &&
        safetyMode === 'normal',
      forcedPositioningPressure: (world?.forcedPositioningPressure ?? 0) > 0.7,
      reflexivityAcceleration: (world?.reflexivityAcceleration ?? 0) > 0.72,
      authorityDecay,
    };
  }

  private applyConstitutionalExecutionAdjustment(
    contractId: string,
    orderStyle: ExecutionPlan['orderStyle'],
    safetyMode: ExecutionPlan['safetyMode'],
    size: number,
  ): ExecutionAdjustment {
    const signals = this.readExecutionSignals(contractId, safetyMode);
    let nextOrderStyle = orderStyle;
    let nextSafetyMode = safetyMode;
    let nextSize = size;

    if (signals.scenarioInvalidated || signals.authorityDecay > 0.72) {
      nextSafetyMode = 'safe-mode';
      nextOrderStyle = 'passive';
      nextSize = clamp(nextSize * 0.72, 5, 800);
    }
    if (signals.predatoryBrake) {
      nextOrderStyle = 'passive';
      nextSize = clamp(nextSize * 0.65, 5, 800);
    }
    if (signals.absorptionAcceleration && nextOrderStyle !== 'passive') {
      nextOrderStyle = 'market';
    }
    if (signals.forcedPositioningPressure) {
      nextSize = clamp(nextSize * 0.82, 5, 800);
    }

    return {
      ...signals,
      orderStyle: nextOrderStyle,
      safetyMode: nextSafetyMode,
      size: nextSize,
    };
  }

  private applyRiskExecutionAdjustment(
    decision: RiskDecision,
    orderStyle: ExecutionPlan['orderStyle'],
    safetyMode: ExecutionPlan['safetyMode'],
    size: number,
    routeReason: string,
  ): RiskExecutionAdjustment {
    const signals = this.readExecutionSignals(decision.contractId, safetyMode);
    let nextOrderStyle = orderStyle;
    let nextSafetyMode = safetyMode;
    let nextSize = size;
    let nextRouteReason = routeReason;

    if (signals.scenarioInvalidated || signals.authorityDecay > 0.72) {
      nextSafetyMode = 'safe-mode';
      nextOrderStyle = 'passive';
      nextSize = clamp(nextSize * 0.72, 1, nextSize);
    }
    if (signals.predatoryBrake) {
      nextOrderStyle = 'passive';
      nextSize = clamp(nextSize * 0.65, 1, nextSize);
      nextRouteReason = `${nextRouteReason}+toxicity-brake`;
    }
    if (signals.absorptionAcceleration && nextOrderStyle !== 'passive') {
      nextOrderStyle = 'market';
      nextRouteReason = `${nextRouteReason}+absorption-acceleration`;
    }
    if (signals.forcedPositioningPressure) {
      nextSize = clamp(nextSize * 0.82, 1, nextSize);
      nextRouteReason = `${nextRouteReason}+positioning-throttle`;
    }

    return {
      ...signals,
      orderStyle: nextOrderStyle,
      safetyMode: nextSafetyMode,
      size: nextSize,
      routeReason: nextRouteReason,
    };
  }

  private resolveExecutionParameters(
    orderStyle: ExecutionPlan['orderStyle'],
    safetyMode: ExecutionPlan['safetyMode'],
    expectedSlippage: number,
    fillProbability: number,
    predatoryBrake: boolean,
    absorptionAcceleration: boolean,
    reflexivityAcceleration: boolean,
  ): ExecutionParameters {
    let slices = this.resolveSlices(orderStyle);
    let adjustedSlippage = expectedSlippage;
    let adjustedFillProbability = fillProbability;

    if (predatoryBrake) {
      adjustedSlippage = clamp(adjustedSlippage + 0.004, 0.001, 1);
      adjustedFillProbability = clamp(adjustedFillProbability * 0.82, 0.01, 1);
    }
    if (absorptionAcceleration) {
      adjustedSlippage = clamp(adjustedSlippage - 0.0015, 0.001, 1);
      adjustedFillProbability = clamp(adjustedFillProbability * 1.08, 0.01, 1);
    }
    if (reflexivityAcceleration) {
      slices = Math.max(slices, 2);
    }

    let latencyBudgetMs = this.resolveLatencyBudget(orderStyle, safetyMode);
    if (absorptionAcceleration) {
      latencyBudgetMs = Math.max(30, latencyBudgetMs - 20);
    }

    return {
      slices,
      expectedSlippage: adjustedSlippage,
      fillProbability: adjustedFillProbability,
      latencyBudgetMs,
    };
  }

  private resolveConstitutionalRouteReason(adjustment: ExecutionAdjustment): string {
    if (adjustment.predatoryBrake) {
      return 'constitutional-decision+toxicity-brake';
    }
    if (adjustment.scenarioInvalidated) {
      return 'constitutional-decision+scenario-invalidation';
    }
    if (adjustment.absorptionAcceleration) {
      return 'constitutional-decision+absorption-acceleration';
    }
    return 'constitutional-decision';
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
    this.bus.emit(EVENTS.EXECUTION_PLAN, plan, {
      snapshotId: plan.executionId,
      source: 'execution-intelligence',
      idempotencyKey: `execution-plan:${plan.executionId}:${plan.contractId}`,
      timestamp: plan.timestamp,
    });
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

  private isStaleConstitutionalDecision(decision: ConstitutionalDecisionEvent): boolean {
    const snapshotSeq = parseSnapshotSequence(decision.snapshot_id);
    if (snapshotSeq !== null) {
      const latestSnapshotSeq = this.latestConstitutionalSnapshotSeq.get(decision.contractId);
      if (latestSnapshotSeq !== undefined && snapshotSeq < latestSnapshotSeq) {
        return true;
      }
      if (latestSnapshotSeq === undefined || snapshotSeq > latestSnapshotSeq) {
        this.latestConstitutionalSnapshotSeq.set(decision.contractId, snapshotSeq);
      }
    }

    const latestDecisionTs = this.latestConstitutionalDecisionTs.get(decision.contractId);
    if (latestDecisionTs !== undefined && decision.timestamp < latestDecisionTs) {
      return true;
    }
    this.latestConstitutionalDecisionTs.set(decision.contractId, decision.timestamp);

    return false;
  }

  private buildExecutionId(decision: RiskDecision): string {
    return `exec-${decision.contractId}-${decision.direction}-${Math.floor(decision.timestamp)}`;
  }

  private publishState(event: ExecutionStateEvent): void {
    this.states.set(event.executionId, event);
    this.bus.emit(EVENTS.EXECUTION_STATE, event, {
      snapshotId: event.executionId,
      source: 'execution-intelligence',
      idempotencyKey: `execution-state:${event.executionId}:${event.phase}:${event.timestamp}`,
      timestamp: event.timestamp,
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function parseSnapshotSequence(snapshotId: string): number | null {
  const parts = snapshotId.split(':');
  if (parts.length < 2) {
    return null;
  }

  const sequence = Number(parts[1]);
  if (!Number.isInteger(sequence) || sequence < 0) {
    return null;
  }

  return sequence;
}
