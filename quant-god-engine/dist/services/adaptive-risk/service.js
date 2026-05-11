import { EVENTS } from '../../core/event-bus/events.js';
export class AdaptiveRiskEngine {
    constructor(bus, initialCapital, riskLimit) {
        this.bus = bus;
        this.riskLimit = riskLimit;
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
    start() {
        this.bus.on(EVENTS.AGGREGATED_SIGNAL, (signal) => {
            if (signal.direction === 'FLAT')
                return;
            const edge = Math.abs(signal.score) / 100;
            const liquidityFactor = signal.regime === 'low-liquidity' ? 0.4 : 1;
            const regimeConfidence = signal.regime === 'panic' ? 0.3 : 0.9;
            const size = this.portfolio.capital * edge * liquidityFactor * regimeConfidence * this.riskLimit;
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
                timestamp: Date.now(),
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
