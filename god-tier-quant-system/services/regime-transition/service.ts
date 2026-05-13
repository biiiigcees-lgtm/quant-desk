import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
import type {
  MicrostructureEvent,
  FeatureEvent,
  DriftEvent,
  RegimeTransitionEvent,
  Regime,
} from '../../core/schemas/events.js';

const REGIMES: Regime[] = [
  'trending', 'choppy', 'panic', 'low-liquidity',
  'reversal-prone', 'momentum-ignition', 'compression', 'expansion',
];

// Markov transition matrix priors: P(R_next | R_current)
// Each row sums to 1. Rows are current regime, columns are next.
const TRANSITION_PRIOR: Record<Regime, Record<Regime, number>> = {
  trending:          { trending: 0.60, 'reversal-prone': 0.12, choppy: 0.08, panic: 0.04, 'low-liquidity': 0.03, 'momentum-ignition': 0.07, compression: 0.04, expansion: 0.02 },
  choppy:            { trending: 0.10, 'reversal-prone': 0.08, choppy: 0.50, panic: 0.05, 'low-liquidity': 0.08, 'momentum-ignition': 0.05, compression: 0.10, expansion: 0.04 },
  panic:             { trending: 0.05, 'reversal-prone': 0.20, choppy: 0.15, panic: 0.40, 'low-liquidity': 0.08, 'momentum-ignition': 0.04, compression: 0.04, expansion: 0.04 },
  'low-liquidity':   { trending: 0.08, 'reversal-prone': 0.06, choppy: 0.20, panic: 0.10, 'low-liquidity': 0.45, 'momentum-ignition': 0.04, compression: 0.05, expansion: 0.02 },
  'reversal-prone':  { trending: 0.15, 'reversal-prone': 0.40, choppy: 0.18, panic: 0.08, 'low-liquidity': 0.04, 'momentum-ignition': 0.08, compression: 0.04, expansion: 0.03 },
  'momentum-ignition': { trending: 0.35, 'reversal-prone': 0.15, choppy: 0.06, panic: 0.08, 'low-liquidity': 0.03, 'momentum-ignition': 0.25, compression: 0.04, expansion: 0.04 },
  compression:       { trending: 0.12, 'reversal-prone': 0.08, choppy: 0.20, panic: 0.06, 'low-liquidity': 0.05, 'momentum-ignition': 0.10, compression: 0.35, expansion: 0.04 },
  expansion:         { trending: 0.20, 'reversal-prone': 0.12, choppy: 0.10, panic: 0.08, 'low-liquidity': 0.04, 'momentum-ignition': 0.12, compression: 0.04, expansion: 0.30 },
};

interface ContractTransitionState {
  currentRegime: Regime;
  timeInRegime: number;
  // Empirical counts for Bayesian update of transition matrix
  transitionCounts: Record<Regime, Record<Regime, number>>;
}

function classifyRegime(micro: MicrostructureEvent, feat: FeatureEvent, drift: DriftEvent | null): Regime {
  if (micro.panicRepricing) return 'panic';
  if (micro.liquidityRegime === 'vacuum' || micro.liquidityRegime === 'thin') return 'low-liquidity';
  if (Math.abs(micro.obiVelocity) > 0.4 && Math.abs(micro.obi) > 0.4) return 'momentum-ignition';
  if (feat.volatility < 0.01 && feat.spreadExpansionScore < 0.1) return 'compression';
  if (feat.volatility > 0.04) return 'expansion';
  if (feat.probabilityVelocity < -0.01) return 'reversal-prone';
  if (feat.probabilityVelocity > 0.01) return 'trending';
  return 'choppy';
}

function entropy(dist: Record<string, number>): number {
  let h = 0;
  for (const p of Object.values(dist)) {
    if (p > 1e-9) h -= p * Math.log2(p);
  }
  return h;
}

function normalizeRow(row: Record<Regime, number>): Record<Regime, number> {
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total < 1e-9) return { ...row };
  const norm = {} as Record<Regime, number>;
  for (const r of REGIMES) norm[r] = (row[r] ?? 0) / total;
  return norm;
}

function initCounts(): Record<Regime, Record<Regime, number>> {
  const counts = {} as Record<Regime, Record<Regime, number>>;
  for (const r of REGIMES) {
    counts[r] = {} as Record<Regime, number>;
    for (const s of REGIMES) counts[r]![s] = 0;
  }
  return counts;
}

export class RegimeTransitionService {
  private readonly contractState = new Map<string, ContractTransitionState>();
  private readonly microCache = new Map<string, MicrostructureEvent>();
  private readonly featureCache = new Map<string, FeatureEvent>();
  private readonly driftCache = new Map<string, DriftEvent>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, safeHandler((e) => {
      this.microCache.set(e.contractId, e);
      this.maybeEmit(e.contractId, e.timestamp);
    }, 'RegimeTransition.micro'));

    this.bus.on<FeatureEvent>(EVENTS.FEATURES, safeHandler((e) => {
      this.featureCache.set(e.contractId, e);
      this.maybeEmit(e.contractId, e.timestamp);
    }, 'RegimeTransition.features'));

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, safeHandler((e) => {
      this.driftCache.set(e.contractId, e);
    }, 'RegimeTransition.drift'));
  }

  private maybeEmit(contractId: string, timestamp: number): void {
    const micro = this.microCache.get(contractId);
    const feat = this.featureCache.get(contractId);
    if (!micro || !feat) return;

    const drift = this.driftCache.get(contractId) ?? null;
    const newRegime = classifyRegime(micro, feat, drift);

    let state = this.contractState.get(contractId);
    if (!state) {
      state = {
        currentRegime: newRegime,
        timeInRegime: 1,
        transitionCounts: initCounts(),
      };
      this.contractState.set(contractId, state);
    } else {
      const prev = state.currentRegime;
      if (prev !== newRegime) {
        state.transitionCounts[prev]![newRegime] = (state.transitionCounts[prev]![newRegime] ?? 0) + 1;
        state.currentRegime = newRegime;
        state.timeInRegime = 1;
      } else {
        state.timeInRegime++;
      }
    }

    // Compute posterior transition row for current regime (prior + empirical counts)
    const prior = TRANSITION_PRIOR[state.currentRegime]!;
    const empirical = state.transitionCounts[state.currentRegime]!;
    const α = 5; // prior strength
    const posterior = {} as Record<Regime, number>;
    for (const r of REGIMES) {
      posterior[r] = (prior[r] ?? 0) * α + (empirical[r] ?? 0);
    }
    const normalized = normalizeRow(posterior);

    const sorted = REGIMES
      .map(r => ({ regime: r, probability: normalized[r] ?? 0 }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);

    const regimeInstability = Math.min(1, entropy(normalized) / Math.log2(REGIMES.length));
    const transitionImminent = sorted[0]!.regime !== state.currentRegime && sorted[0]!.probability > 0.4;

    const event: RegimeTransitionEvent = {
      contractId,
      currentRegime: state.currentRegime,
      mostLikelyNextRegimes: sorted,
      regimeInstability,
      timeInCurrentRegime: state.timeInRegime,
      transitionImminent,
      timestamp,
    };
    this.bus.emit<RegimeTransitionEvent>(EVENTS.REGIME_TRANSITION, event);
  }
}
