import { ExecutionCoordinator } from '../../core/determinism/execution-coordinator.js';
import { MonotonicLogicalClock } from '../../core/determinism/logical-clock.js';
import { EVENTS } from '../../core/event-bus/events.js';
export class ExecutionIntelligenceEngine {
    constructor(bus, clock = new MonotonicLogicalClock()) {
        this.bus = bus;
        this.clock = clock;
        this.coordinator = new ExecutionCoordinator({
            leaseTtlMs: 5000,
            idempotencyTtlMs: 30000,
        });
        this.states = new Map();
        this.latestConstitutionalSnapshotSeq = new Map();
        this.latestConstitutionalDecisionTs = new Map();
        this.latestRiskDecisionTs = new Map();
        this.latestAiExecutionAdvisoryTs = 0;
        this.aiExecutionAdvisory = null;
    }
    start() {
        this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
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
        });
        this.bus.on(EVENTS.CONSTITUTIONAL_DECISION, (decision) => {
            this.handleConstitutionalDecision(decision);
        });
        this.bus.on(EVENTS.RISK_DECISION, (decision) => {
            this.handleRiskDecision(decision);
        });
        this.bus.on(EVENTS.ORDER_EVENT, (order) => {
            this.handleOrderEvent(order);
        });
    }
    handleConstitutionalDecision(decision) {
        const decisionTime = this.clock.observe(decision.timestamp);
        const executionId = `exec-${decision.contractId}-${decision.cycle_id}`;
        if (!decision.trade_allowed || decision.execution_mode === 'blocked') {
            this.publishState({
                executionId,
                contractId: decision.contractId,
                phase: 'blocked',
                reason: 'constitutional-block',
                safetyMode: 'hard-stop',
                timestamp: decisionTime,
            });
            return;
        }
        if (this.isStaleConstitutionalDecision(decision)) {
            this.publishState({
                executionId,
                contractId: decision.contractId,
                phase: 'blocked',
                reason: 'stale-constitutional-snapshot',
                safetyMode: 'safe-mode',
                timestamp: decisionTime,
            });
            return;
        }
        const dedupeKey = `constitutional:${decision.contractId}:${decision.snapshot_id}`;
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
                safetyMode: 'safe-mode',
                timestamp: decisionTime,
            });
            return;
        }
        try {
            const direction = decision.final_probability >= 0.5 ? 'YES' : 'NO';
            const safetyMode = decision.risk_level >= 75 ? 'safe-mode' : 'normal';
            const baselineSize = 150 * Math.max(0.02, Math.abs(decision.edge_score)) * Math.max(0.1, decision.confidence_score);
            const size = clamp(baselineSize, 5, 800);
            const limitPrice = clamp(decision.final_probability, 0.01, 0.99);
            let orderStyle = decision.execution_mode === 'passive' ? 'passive' : 'market';
            if (this.aiExecutionAdvisory
                && this.aiExecutionAdvisory.confidence >= 0.55
                && this.latestAiExecutionAdvisoryTs >= decision.timestamp) {
                orderStyle = this.aiExecutionAdvisory.orderStyle;
            }
            const slices = this.resolveSlices(orderStyle);
            const slippage = this.resolveSlippage(orderStyle);
            const fillProbability = this.resolveFillProbability(orderStyle);
            const plan = {
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
                timestamp: decisionTime,
            };
            this.emitPlanLifecycle(plan, 'constitutional-created');
            this.coordinator.release(decision.contractId, lease.token ?? '', true);
        }
        catch (error) {
            this.coordinator.release(decision.contractId, lease.token ?? '', false);
            throw error;
        }
    }
    handleRiskDecision(decision) {
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
        }
        catch (error) {
            this.coordinator.release(decision.contractId, lease.token ?? '', false);
            throw error;
        }
    }
    buildPlanFromRiskDecision(decision, executionId) {
        let orderStyle = 'market';
        let routeReason = 'baseline-market';
        if (decision.ruinProbability > 0.15) {
            orderStyle = 'passive';
            routeReason = 'ruin-probability-protective-passive';
        }
        else if (decision.size > 500) {
            orderStyle = 'sliced';
            routeReason = 'large-size-sliced';
        }
        else if (decision.safetyMode === 'safe-mode') {
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
            timestamp: this.clock.observe(decision.timestamp),
        };
    }
    handleOrderEvent(order) {
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
    emitPlanLifecycle(plan, reason) {
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
    resolveSlices(orderStyle) {
        if (this.aiExecutionAdvisory) {
            return clamp(this.aiExecutionAdvisory.slices, 1, 10);
        }
        if (orderStyle === 'sliced') {
            return 4;
        }
        return 1;
    }
    resolveSlippage(orderStyle) {
        if (this.aiExecutionAdvisory) {
            return clamp(this.aiExecutionAdvisory.expectedSlippage, 0.001, 1);
        }
        return this.resolveBaselineSlippage(orderStyle);
    }
    resolveFillProbability(orderStyle) {
        if (this.aiExecutionAdvisory) {
            return clamp(this.aiExecutionAdvisory.fillProbability, 0.01, 1);
        }
        return this.resolveBaselineFillProbability(orderStyle);
    }
    resolveBaselineSlippage(orderStyle) {
        if (orderStyle === 'market') {
            return 0.015;
        }
        if (orderStyle === 'sliced') {
            return 0.008;
        }
        return 0.004;
    }
    resolveBaselineFillProbability(orderStyle) {
        if (orderStyle === 'passive') {
            return 0.72;
        }
        return 0.93;
    }
    resolveLatencyBudget(orderStyle, mode) {
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
    phaseForOrderStatus(status) {
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
    isStaleConstitutionalDecision(decision) {
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
    buildExecutionId(decision) {
        return `exec-${decision.contractId}-${decision.direction}-${Math.floor(decision.timestamp)}`;
    }
    publishState(event) {
        this.states.set(event.executionId, event);
        this.bus.emit(EVENTS.EXECUTION_STATE, event, {
            snapshotId: event.executionId,
            source: 'execution-intelligence',
            idempotencyKey: `execution-state:${event.executionId}:${event.phase}:${event.timestamp}`,
            timestamp: event.timestamp,
        });
    }
}
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
function parseSnapshotSequence(snapshotId) {
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
