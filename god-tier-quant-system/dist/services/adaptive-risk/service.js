import { MonotonicLogicalClock } from '../../core/determinism/logical-clock.js';
import { EVENTS } from '../../core/event-bus/events.js';
export class AdaptiveRiskEngine {
    constructor(bus, initialCapital, riskLimit, clock = new MonotonicLogicalClock()) {
        this.bus = bus;
        this.riskLimit = riskLimit;
        this.clock = clock;
        this.control = {
            mode: 'normal',
            reason: 'ready',
            timestamp: 1,
        };
        this.executionDegradation = 0;
        this.aiRiskLevel = 50;
        this.aiRiskRecommendation = 'neutral';
        this.portfolio = {
            capital: initialCapital,
            exposure: 0,
            realizedPnl: 0,
            unrealizedPnl: 0,
            drawdown: 0,
            entropy: 0,
            byRegimeExposure: {},
            byStrategyExposure: {},
            positions: [],
            timestamp: this.clock.now(),
        };
    }
    start() {
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            const degraded = event.brier >= 0.22 || event.ece >= 0.16;
            const caution = event.brier >= 0.14 || event.ece >= 0.1;
            let mode = 'normal';
            let reason = 'calibration-ok';
            if (degraded) {
                mode = 'hard-stop';
                reason = 'calibration-critical';
            }
            else if (caution) {
                mode = 'safe-mode';
                reason = 'calibration-caution';
            }
            this.control = {
                contractId: event.contractId,
                mode,
                reason,
                brier: event.brier,
                ece: event.ece,
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
        });
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            const degraded = event.severity === 'high' || event.psi >= 0.3 || event.kl >= 0.2;
            if (!degraded)
                return;
            this.control = {
                contractId: event.contractId,
                mode: 'hard-stop',
                reason: 'drift-critical',
                drift: Math.max(event.psi, event.kl),
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
        });
        this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
            if (event.status === 'fail') {
                this.control = {
                    contractId: event.contractId,
                    mode: 'hard-stop',
                    reason: `${event.kind}-validation-failed`,
                    timestamp: event.timestamp,
                };
                this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
            }
        });
        this.bus.on(EVENTS.ORDER_EVENT, (order) => {
            if (order.status === 'rejected' || order.status === 'partial') {
                this.executionDegradation += 1;
            }
            else {
                this.executionDegradation = Math.max(0, this.executionDegradation - 1);
            }
            if (this.executionDegradation >= 3) {
                this.control = {
                    mode: 'hard-stop',
                    reason: 'execution-degradation',
                    timestamp: this.clock.tick(),
                };
                this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
            }
        });
        this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
            const score = Number(event.risk_level?.score ?? 50);
            this.aiRiskLevel = Math.max(0, Math.min(100, score));
            const recommendation = event.risk_level?.recommendation;
            this.aiRiskRecommendation =
                recommendation === 'de-risk' || recommendation === 'scale-up' ? recommendation : 'neutral';
            if (this.control.mode !== 'hard-stop' && this.aiRiskLevel >= 90) {
                this.control = {
                    contractId: event.contractId,
                    mode: 'safe-mode',
                    reason: 'ai-risk-caution',
                    timestamp: this.clock.observe(Number(event.timestamp ?? this.clock.tick())),
                };
                this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
            }
        });
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, (signal) => {
            if (signal.direction === 'FLAT')
                return;
            if (this.control.mode === 'hard-stop') {
                this.bus.emit(EVENTS.RISK_DECISION, {
                    contractId: signal.contractId,
                    approved: false,
                    reason: this.control.reason,
                    direction: signal.direction,
                    size: 0,
                    limitPrice: 0.5,
                    ruinProbability: 1,
                    safetyMode: this.control.mode,
                    timestamp: this.clock.tick(),
                });
                return;
            }
            const edge = Math.abs(signal.score) / 100;
            const liquidityFactor = signal.regime === 'low-liquidity' ? 0.4 : 1;
            const regimeConfidence = signal.regime === 'panic' ? 0.3 : 0.9;
            const calibrationThrottle = this.control.mode === 'safe-mode' ? 0.45 : 1;
            let aiThrottle = 1;
            if (this.aiRiskRecommendation === 'de-risk') {
                aiThrottle = 0.6;
            }
            else if (this.aiRiskRecommendation === 'scale-up' && this.aiRiskLevel < 40) {
                aiThrottle = 1.05;
            }
            const size = this.portfolio.capital * edge * liquidityFactor * regimeConfidence * this.riskLimit * calibrationThrottle * aiThrottle;
            const ruinProbability = this.estimateRuinProbability(edge, size);
            const approved = ruinProbability < 0.2 && this.portfolio.exposure + size < this.portfolio.capital * 0.35;
            const decision = {
                contractId: signal.contractId,
                approved,
                reason: approved ? 'risk-approved' : 'risk-rejected',
                direction: signal.direction,
                size: approved ? size : 0,
                limitPrice: 0.5 + (signal.direction === 'YES' ? 0.02 : -0.02),
                ruinProbability,
                safetyMode: this.control.mode,
                timestamp: this.clock.observe(signal.timestamp),
            };
            this.bus.emit(EVENTS.RISK_DECISION, decision);
        });
        this.bus.on(EVENTS.PORTFOLIO_UPDATE, (portfolio) => {
            this.portfolio = portfolio;
        });
    }
    estimateRuinProbability(edge, size) {
        const samples = 128;
        let ruins = 0;
        for (let i = 0; i < samples; i++) {
            const noise = (Math.sin(i * 13.37) + 1) / 2;
            const pnl = size * (edge - 0.5 * noise);
            if (this.portfolio.capital + pnl < this.portfolio.capital * 0.7) {
                ruins += 1;
            }
        }
        return ruins / samples;
    }
}
