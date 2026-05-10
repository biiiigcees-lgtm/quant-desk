import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import {
  MicrostructureEvent,
  ParticipantFlowEvent,
  ParticipantType,
} from '../../core/schemas/events.js';

// Rolling window size for participant classification.
const WINDOW_SIZE = 20;

type ParticipantRecord = { type: ParticipantType; aggressionScore: number };

interface ContractParticipantState {
  window: ParticipantRecord[];
  distribution: Record<ParticipantType, number>;
  dominant: ParticipantType;
  aggressionIndex: number;
  trappedTraderSignal: boolean;
}

const ALL_TYPES: ParticipantType[] = [
  'liquidity-provider', 'momentum', 'panic-flow', 'arbitrage', 'trapped-trader',
];

export class MarketParticipantModelService {
  private readonly state: Map<string, ContractParticipantState> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, (event) => {
      const participant = this.classify(event);
      this.update(event.contractId, participant, event.timestamp);
    });
  }

  getLatestFlow(contractId: string): ParticipantFlowEvent | undefined {
    const s = this.state.get(contractId);
    if (!s) return undefined;
    return this.buildEvent(contractId, s, Date.now());
  }

  getAllFlows(): ParticipantFlowEvent[] {
    const result: ParticipantFlowEvent[] = [];
    const now = Date.now();
    for (const [id, s] of this.state) {
      result.push(this.buildEvent(id, s, now));
    }
    return result;
  }

  private classify(event: MicrostructureEvent): ParticipantRecord {
    let type: ParticipantType;

    if (event.panicRepricing || (event.sweepProbability > 0.75 && event.liquidityRegime === 'vacuum')) {
      type = 'panic-flow';
    } else if (event.obiVelocity < -0.4 && event.obi > 0.5) {
      // OBI reversing sharply under sustained buy pressure → trapped longs unwinding
      type = 'trapped-trader';
    } else if (event.spreadExpansionScore < 0.08 && event.aggressionScore > 0.7) {
      // Tight spreads + high aggression → likely arbitrage or HFT
      type = 'arbitrage';
    } else if (event.spreadExpansionScore < 0.15 && Math.abs(event.obi) < 0.15) {
      // Balanced OBI, tight spreads → passive liquidity providers
      type = 'liquidity-provider';
    } else {
      // Default: directional momentum flow
      type = 'momentum';
    }

    return { type, aggressionScore: event.aggressionScore };
  }

  private update(contractId: string, record: ParticipantRecord, timestamp: number): void {
    if (!this.state.has(contractId)) {
      this.state.set(contractId, {
        window: [],
        distribution: Object.fromEntries(ALL_TYPES.map((t) => [t, 0])) as Record<ParticipantType, number>,
        dominant: 'momentum',
        aggressionIndex: 0,
        trappedTraderSignal: false,
      });
    }

    const s = this.state.get(contractId)!;
    s.window.push(record);
    if (s.window.length > WINDOW_SIZE) s.window.shift();

    // Recompute distribution over rolling window.
    const counts = Object.fromEntries(ALL_TYPES.map((t) => [t, 0])) as Record<ParticipantType, number>;
    let aggressionSum = 0;
    for (const r of s.window) {
      counts[r.type] += 1;
      aggressionSum += r.aggressionScore;
    }

    const total = s.window.length;
    let dominant: ParticipantType = 'momentum';
    let maxCount = 0;
    for (const t of ALL_TYPES) {
      const fraction = Number((counts[t] / total).toFixed(4));
      s.distribution[t] = fraction;
      if (counts[t] > maxCount) {
        maxCount = counts[t];
        dominant = t;
      }
    }

    s.dominant = dominant;
    s.aggressionIndex = Number((aggressionSum / total).toFixed(4));
    s.trappedTraderSignal = s.distribution['trapped-trader'] > 0.20;

    this.bus.emit<ParticipantFlowEvent>(EVENTS.PARTICIPANT_FLOW, this.buildEvent(contractId, s, timestamp));
  }

  private buildEvent(contractId: string, s: ContractParticipantState, timestamp: number): ParticipantFlowEvent {
    return {
      contractId,
      dominant: s.dominant,
      distribution: { ...s.distribution },
      aggressionIndex: s.aggressionIndex,
      trappedTraderSignal: s.trappedTraderSignal,
      timestamp,
    };
  }
}
