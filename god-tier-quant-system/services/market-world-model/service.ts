import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  CausalMarketStateEvent,
  CrossMarketCausalStateEvent,
  GlobalContextEvent,
  MarketWorldStateEvent,
  ParticipantFlowEvent,
  ScenarioBranchStateEvent,
} from '../../core/schemas/events.js';

interface ContractWorldInputs {
  causal?: CausalMarketStateEvent;
  participant?: ParticipantFlowEvent;
  scenario?: ScenarioBranchStateEvent;
  crossMarket?: CrossMarketCausalStateEvent;
  global?: GlobalContextEvent;
}

export class MarketWorldModelService {
  private readonly byContract = new Map<string, ContractWorldInputs>();
  private readonly latest = new Map<string, MarketWorldStateEvent>();
  private latestGlobal: GlobalContextEvent | undefined;

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<CausalMarketStateEvent>(EVENTS.MARKET_CAUSAL_STATE, (event) => {
      const state = this.getState(event.contractId);
      state.causal = event;
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on<ParticipantFlowEvent>(EVENTS.PARTICIPANT_FLOW, (event) => {
      const state = this.getState(event.contractId);
      state.participant = event;
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on<ScenarioBranchStateEvent>(EVENTS.SCENARIO_BRANCH_STATE, (event) => {
      const state = this.getState(event.contractId);
      state.scenario = event;
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on<CrossMarketCausalStateEvent>(EVENTS.CROSS_MARKET_CAUSAL_STATE, (event) => {
      const state = this.getState(event.contractId);
      state.crossMarket = event;
      this.emit(event.contractId, event.timestamp);
    });

    this.bus.on<GlobalContextEvent>(EVENTS.GLOBAL_CONTEXT, (event) => {
      this.latestGlobal = event;
      for (const contractId of this.byContract.keys()) {
        const state = this.getState(contractId);
        state.global = event;
        this.emit(contractId, event.timestamp);
      }
    });
  }

  getLatest(contractId: string): MarketWorldStateEvent | undefined {
    return this.latest.get(contractId);
  }

  private getState(contractId: string): ContractWorldInputs {
    const current = this.byContract.get(contractId);
    if (current) {
      return current;
    }
    const next: ContractWorldInputs = {
      global: this.latestGlobal,
    };
    this.byContract.set(contractId, next);
    return next;
  }

  private emit(contractId: string, timestamp: number): void {
    const state = this.byContract.get(contractId);
    if (!state?.causal || !state.participant || !state.scenario) {
      return;
    }

    const participantIntent = mapIntent(state.participant);
    const globalLiquidityScore = resolveGlobalLiquidityScore(state.global?.liquidity);

    const syntheticLiquidityProbability = clamp(
      state.participant.distribution['liquidity-provider'] * 0.5 +
      globalLiquidityScore * 0.25 +
      (1 - state.causal.instabilityRisk) * 0.25,
      0,
      1,
    );

    const forcedPositioningPressure = clamp(
      state.participant.aggressionIndex * 0.45 +
      state.scenario.volatilityWeight * 0.3 +
      state.causal.instabilityRisk * 0.25,
      0,
      1,
    );

    const reflexivityAcceleration = clamp(
      (state.causal.topDriver?.strength ?? 0) * 0.4 +
      (state.crossMarket?.riskTransmissionScore ?? 0.45) * 0.35 +
      Math.abs(state.participant.distribution.momentum - state.participant.distribution['liquidity-provider']) * 0.25,
      0,
      1,
    );

    const worldConfidence = clamp(
      state.causal.confidence * 0.4 +
      (1 - state.scenario.volatilityWeight) * 0.25 +
      syntheticLiquidityProbability * 0.2 +
      (1 - (state.crossMarket?.riskTransmissionScore ?? 0.5)) * 0.15,
      0,
      1,
    );

    const event: MarketWorldStateEvent = {
      contractId,
      participantIntent,
      syntheticLiquidityProbability: Number(syntheticLiquidityProbability.toFixed(4)),
      forcedPositioningPressure: Number(forcedPositioningPressure.toFixed(4)),
      reflexivityAcceleration: Number(reflexivityAcceleration.toFixed(4)),
      worldConfidence: Number(worldConfidence.toFixed(4)),
      scenarioDominantBranch: state.scenario.dominantBranch,
      hiddenState: state.causal.hiddenState,
      timestamp,
    };

    this.latest.set(contractId, event);
    this.bus.emit<MarketWorldStateEvent>(EVENTS.MARKET_WORLD_STATE, event);
    this.bus.emit(EVENTS.TELEMETRY, {
      name: 'market.world.confidence',
      value: event.worldConfidence,
      tags: { contractId, intent: event.participantIntent },
      timestamp,
    });
  }
}

function mapIntent(flow: ParticipantFlowEvent): MarketWorldStateEvent['participantIntent'] {
  if (flow.dominant === 'panic-flow') {
    return 'liquidation';
  }
  if (flow.dominant === 'trapped-trader') {
    return 'hedging';
  }
  if (flow.dominant === 'liquidity-provider') {
    return flow.aggressionIndex < 0.4 ? 'accumulation' : 'distribution';
  }
  if (flow.dominant === 'momentum') {
    return flow.aggressionIndex > 0.62 ? 'distribution' : 'accumulation';
  }
  return 'neutral';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function resolveGlobalLiquidityScore(liquidity: GlobalContextEvent['liquidity'] | undefined): number {
  if (liquidity === 'abundant') {
    return 0.82;
  }
  if (liquidity === 'normal') {
    return 0.6;
  }
  return 0.35;
}
