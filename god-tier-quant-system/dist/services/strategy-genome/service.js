import { EVENTS } from '../../core/event-bus/events.js';
// Minimum audit samples before a strategy can graduate from birth.
const MIN_AUDITS_FOR_GROWTH = 5;
const MIN_AUDITS_FOR_MATURITY = 20;
export class StrategyGenomeService {
    constructor(bus, ecology) {
        this.bus = bus;
        this.ecology = ecology;
        this.genomes = new Map();
    }
    start() {
        this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
            const state = this.getOrCreate(event.strategyId);
            const scoreNorm = Math.max(0, Math.min(100, event.score));
            // Exponential moving average of audit scores.
            state.auditScore = state.auditCount === 0
                ? scoreNorm
                : state.auditScore * 0.85 + scoreNorm * 0.15;
            state.auditCount += 1;
            state.consecutiveFails = event.status === 'fail' ? state.consecutiveFails + 1 : 0;
            this.evaluateTransition(event.strategyId, state, event.timestamp);
        });
        // Calibration drift degrades strategy confidence across all strategies.
        this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
            for (const [id, state] of this.genomes) {
                state.calibrationEce = event.ece;
                this.evaluateTransition(id, state, event.timestamp);
            }
        });
        // Feature distribution drift accelerates decay.
        this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
            for (const [id, state] of this.genomes) {
                state.driftSeverity = event.severity;
                this.evaluateTransition(id, state, event.timestamp);
            }
        });
    }
    getOrCreate(strategyId) {
        if (!this.genomes.has(strategyId)) {
            this.genomes.set(strategyId, {
                phase: 'birth',
                auditScore: 50,
                auditCount: 0,
                consecutiveFails: 0,
                calibrationEce: 0,
                driftSeverity: 'low',
                lastTransition: Date.now(),
            });
        }
        return this.genomes.get(strategyId);
    }
    evaluateTransition(strategyId, state, timestamp) {
        const fitness = this.ecology.currentFitness()[strategyId] ?? 0;
        const nextPhase = this.resolvePhase(state, fitness);
        if (nextPhase !== state.phase) {
            const previous = state.phase;
            state.phase = nextPhase;
            state.lastTransition = timestamp;
            const event = {
                strategyId,
                phase: nextPhase,
                previousPhase: previous,
                fitness,
                auditScore: state.auditScore,
                reason: this.transitionReason(previous, nextPhase, state),
                timestamp,
            };
            this.bus.emit(EVENTS.STRATEGY_LIFECYCLE, event);
        }
    }
    resolvePhase(state, fitness) {
        const { phase, auditScore, auditCount, consecutiveFails, calibrationEce, driftSeverity } = state;
        // Extinction is terminal — no recovery.
        if (phase === 'extinction')
            return 'extinction';
        // Extinction triggers: catastrophic audit failure or severe calibration collapse.
        if (auditScore < 20 || (calibrationEce > 0.25 && auditScore < 30) || consecutiveFails >= 8) {
            return 'extinction';
        }
        // Decay triggers: sustained poor audit performance or severe drift.
        if (auditScore < 45 ||
            (driftSeverity === 'high' && auditScore < 60) ||
            consecutiveFails >= 4) {
            if (phase === 'maturity' || phase === 'growth')
                return 'decay';
            if (phase === 'decay')
                return 'decay';
        }
        // Recovery from decay: audit score rebounds.
        if (phase === 'decay' && auditScore >= 60 && calibrationEce < 0.12 && driftSeverity !== 'high') {
            return 'growth';
        }
        // Maturity: consistently high performance.
        if ((phase === 'growth' || phase === 'maturity') &&
            auditScore >= 70 &&
            calibrationEce < 0.10 &&
            fitness > 0.5 &&
            auditCount >= MIN_AUDITS_FOR_MATURITY) {
            return 'maturity';
        }
        // Growth: strategy has enough data and is passing audits.
        if (phase === 'birth' &&
            auditScore >= 50 &&
            auditCount >= MIN_AUDITS_FOR_GROWTH &&
            calibrationEce < 0.18) {
            return 'growth';
        }
        return phase;
    }
    transitionReason(from, to, state) {
        if (to === 'extinction')
            return `terminal: auditScore=${state.auditScore.toFixed(1)} consecutiveFails=${state.consecutiveFails} ece=${state.calibrationEce.toFixed(3)}`;
        if (to === 'decay')
            return `decay: auditScore=${state.auditScore.toFixed(1)} drift=${state.driftSeverity} consecutiveFails=${state.consecutiveFails}`;
        if (to === 'growth' && from === 'decay')
            return `recovery: auditScore=${state.auditScore.toFixed(1)} ece=${state.calibrationEce.toFixed(3)}`;
        if (to === 'growth')
            return `graduated: auditCount=${state.auditCount} auditScore=${state.auditScore.toFixed(1)}`;
        if (to === 'maturity')
            return `mature: auditScore=${state.auditScore.toFixed(1)} ece=${state.calibrationEce.toFixed(3)}`;
        return `${from}→${to}`;
    }
}
