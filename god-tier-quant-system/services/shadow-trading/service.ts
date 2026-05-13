import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
import type {
  UnifiedFieldEvent,
  ProbabilityEvent,
  ShadowDecisionEvent,
  ShadowStrategyResult,
  FieldDecision,
} from '../../core/schemas/events.js';

const STRATEGIES = [
  { id: 'conservative', threshold: 0.65 },
  { id: 'moderate',     threshold: 0.58 },
  { id: 'aggressive',   threshold: 0.52 },
];
const HISTORY_WINDOW = 50;
const EMA_α = 0.1;

interface StrategyState {
  id: string;
  threshold: number;
  pendingDecisions: Array<{ decision: FieldDecision; pAbove: number; pBelow: number; timestamp: number }>;
  hitCount: number;
  totalCount: number;
  emaPnl: number;
}

interface ContractState {
  strategies: Map<string, StrategyState>;
  lastPrice: number;
}

function decideForThreshold(pAbove: number, pBelow: number, pNoBet: number, threshold: number): FieldDecision {
  const maxDir = Math.max(pAbove, pBelow);
  if (maxDir < threshold || pNoBet > 0.5) return 'NO BET';
  return pAbove >= pBelow ? 'ABOVE' : 'BELOW';
}

export class ShadowTradingService {
  private readonly contractState = new Map<string, ContractState>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<UnifiedFieldEvent>(EVENTS.UNIFIED_FIELD, safeHandler((e) => {
      this.onField(e);
    }, 'ShadowTrading.field'));

    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, safeHandler((e) => {
      this.onOutcome(e);
    }, 'ShadowTrading.outcome'));
  }

  private onField(e: UnifiedFieldEvent): void {
    const cs = this.getOrInit(e.contractId);
    const strategyResults: ShadowStrategyResult[] = [];

    for (const strat of STRATEGIES) {
      const ss = cs.strategies.get(strat.id)!;
      const decision = decideForThreshold(e.pAbove, e.pBelow, e.pNoBet, strat.threshold);
      const confidence = decision === 'NO BET' ? 0 : Math.max(e.pAbove, e.pBelow) - Math.min(e.pAbove, e.pBelow);

      ss.pendingDecisions.push({ decision, pAbove: e.pAbove, pBelow: e.pBelow, timestamp: e.timestamp });
      if (ss.pendingDecisions.length > HISTORY_WINDOW) ss.pendingDecisions.shift();

      strategyResults.push({
        id: strat.id,
        threshold: strat.threshold,
        decision,
        confidence,
        simulatedPnl: ss.emaPnl,
        hitRate: ss.totalCount > 0 ? ss.hitCount / ss.totalCount : 0.5,
        sampleCount: ss.totalCount,
      });
    }

    // Select best strategy by hit rate (tiebreak: highest threshold for safety)
    const best = strategyResults.reduce((a, b) => {
      const aScore = a.hitRate * 0.7 + (1 - a.threshold) * 0.3;
      const bScore = b.hitRate * 0.7 + (1 - b.threshold) * 0.3;
      return bScore > aScore ? b : a;
    });

    const event: ShadowDecisionEvent = {
      contractId: e.contractId,
      strategies: strategyResults,
      bestStrategyId: best.id,
      dynamicThreshold: STRATEGIES.find(s => s.id === best.id)?.threshold ?? 0.58,
      timestamp: e.timestamp,
    };
    this.bus.emit<ShadowDecisionEvent>(EVENTS.SHADOW_DECISION, event);
  }

  private onOutcome(e: ProbabilityEvent): void {
    const cs = this.contractState.get(e.contractId);
    if (!cs) return;

    const currentPriceDirection = e.marketImpliedProbability >= 0.5 ? 'ABOVE' : 'BELOW';
    cs.lastPrice = e.marketImpliedProbability;

    for (const ss of cs.strategies.values()) {
      if (ss.pendingDecisions.length === 0) continue;
      const pred = ss.pendingDecisions[0]!;
      if (pred.decision === 'NO BET') {
        ss.pendingDecisions.shift();
        continue;
      }

      const correct = pred.decision === currentPriceDirection;
      const pnlDelta = correct ? Math.abs(pred.pAbove - pred.pBelow) : -Math.abs(pred.pAbove - pred.pBelow);
      ss.emaPnl = EMA_α * pnlDelta + (1 - EMA_α) * ss.emaPnl;
      if (correct) ss.hitCount++;
      ss.totalCount++;
      ss.pendingDecisions.shift();
    }
  }

  private getOrInit(contractId: string): ContractState {
    let cs = this.contractState.get(contractId);
    if (!cs) {
      const strategies = new Map<string, StrategyState>();
      for (const s of STRATEGIES) {
        strategies.set(s.id, {
          id: s.id,
          threshold: s.threshold,
          pendingDecisions: [],
          hitCount: 0,
          totalCount: 0,
          emaPnl: 0,
        });
      }
      cs = { strategies, lastPrice: 0.5 };
      this.contractState.set(contractId, cs);
    }
    return cs;
  }
}
