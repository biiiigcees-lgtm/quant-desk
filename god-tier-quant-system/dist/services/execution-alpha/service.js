import { EVENTS } from '../../core/event-bus/events.js';
export class ExecutionAlphaService {
    constructor(bus) {
        this.bus = bus;
    }
    start() {
        this.bus.on(EVENTS.EXECUTION_PLAN, (event) => {
            const payload = {
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
