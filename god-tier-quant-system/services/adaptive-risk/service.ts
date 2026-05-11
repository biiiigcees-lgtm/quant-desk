import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { AggregatedSignal, CalibrationEvent, DriftEvent, ExecutionControlEvent, PortfolioState, RiskDecision, ValidationResultEvent } from '../../core/schemas/events.js';

export class AdaptiveRiskEngine {
  private portfolio: PortfolioState;
  private control: ExecutionControlEvent = {
    mode: 'normal',
    reason: 'ready',
    timestamp: Date.now(),
  };
  private executionDegradation = 0;
  private aiRiskLevel = 50;
  private aiRiskRecommendation: 'de-risk' | 'neutral' | 'scale-up' = 'neutral';

  constructor(private readonly bus: EventBus, initialCapital: number, private readonly riskLimit: number) {
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
      timestamp: Date.now(),
    };
  }

  start(): void {
    this.bus.on<CalibrationEvent>(EVENTS.CALIBRATION_UPDATE, (event) => {
      const degraded = event.brier >= 0.22 || event.ece >= 0.16;
      const caution = event.brier >= 0.14 || event.ece >= 0.1;
      this.control = {
        contractId: event.contractId,
        mode: degraded ? 'hard-stop' : caution ? 'safe-mode' : 'normal',
        reason: degraded ? 'calibration-critical' : caution ? 'calibration-caution' : 'calibration-ok',
        brier: event.brier,
        ece: event.ece,
        timestamp: event.timestamp,
      };
      this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
    });

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, (event) => {
      const degraded = event.severity === 'high' || event.psi >= 0.3 || event.kl >= 0.2;
      if (!degraded) return;
      this.control = {
        contractId: event.contractId,
        mode: 'hard-stop',
        reason: 'drift-critical',
        drift: Math.max(event.psi, event.kl),
        timestamp: event.timestamp,
      };
      this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
    });

    this.bus.on<ValidationResultEvent>(EVENTS.VALIDATION_RESULT, (event) => {
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

    this.bus.on(EVENTS.ORDER_EVENT, (order: { status: string }) => {
      if (order.status === 'rejected' || order.status === 'partial') {
        this.executionDegradation += 1;
      } else {
        this.executionDegradation = Math.max(0, this.executionDegradation - 1);
      }
      if (this.executionDegradation >= 3) {
        this.control = {
          mode: 'hard-stop',
          reason: 'execution-degradation',
          timestamp: Date.now(),
        };
        this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
      }
    });

    this.bus.on(
      EVENTS.AI_AGGREGATED_INTELLIGENCE,
      (event: { risk_level?: { score?: number; recommendation?: string }; timestamp?: number; contractId?: string }) => {
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
            timestamp: event.timestamp ?? Date.now(),
          };
          this.bus.emit(EVENTS.EXECUTION_CONTROL, this.control);
        }
      },
    );

    this.bus.on<AggregatedSignal>(EVENTS.AGGREGATED_SIGNAL, (signal) => {
      if (signal.direction === 'FLAT') return;
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
          timestamp: Date.now(),
        } satisfies RiskDecision);
        return;
      }

      const edge = Math.abs(signal.score) / 100;
      const liquidityFactor = signal.regime === 'low-liquidity' ? 0.4 : 1;
      const regimeConfidence = signal.regime === 'panic' ? 0.3 : 0.9;
      const calibrationThrottle = this.control.mode === 'safe-mode' ? 0.45 : 1;
      const aiThrottle =
        this.aiRiskRecommendation === 'de-risk'
          ? 0.6
          : this.aiRiskRecommendation === 'scale-up' && this.aiRiskLevel < 40
            ? 1.05
            : 1;
      const size =
        this.portfolio.capital * edge * liquidityFactor * regimeConfidence * this.riskLimit * calibrationThrottle * aiThrottle;

      const ruinProbability = this.estimateRuinProbability(edge, size);
      const approved = ruinProbability < 0.2 && this.portfolio.exposure + size < this.portfolio.capital * 0.35;

      const decision: RiskDecision = {
        contractId: signal.contractId,
        approved,
        reason: approved ? 'risk-approved' : 'risk-rejected',
        direction: signal.direction,
        size: approved ? size : 0,
        limitPrice: 0.5 + (signal.direction === 'YES' ? 0.02 : -0.02),
        ruinProbability,
        safetyMode: this.control.mode,
        timestamp: Date.now(),
      };

      this.bus.emit(EVENTS.RISK_DECISION, decision);
    });

    this.bus.on<PortfolioState>(EVENTS.PORTFOLIO_UPDATE, (portfolio) => {
      this.portfolio = portfolio;
    });
  }

  private estimateRuinProbability(edge: number, size: number): number {
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
