import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
import {
  DriftEvent,
  MarketMemoryEvent,
  MicrostructureEvent,
  ParticipantFlowEvent,
  ParticipantType,
  ProbabilityEvent,
} from '../../core/schemas/events.js';

const BUFFER_SIZE = 200;

interface RegimeFingerprint {
  obi: number;
  sweepProbability: number;
  estimatedProb: number;
  driftSeverityCode: number; // none=0 low=1 medium=2 high=3
  participantDominantCode: number; // lp=0 momentum=1 panic=2 arb=3 trapped=4
  timestamp: number;
}

const DRIFT_CODE: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
const PARTICIPANT_CODE: Record<ParticipantType, number> = {
  'liquidity-provider': 0,
  'momentum': 1,
  'panic-flow': 2,
  'arbitrage': 3,
  'trapped-trader': 4,
};

interface ContractMemoryState {
  buffer: RegimeFingerprint[];
  writeHead: number;
  count: number; // total fingerprints written (capped at BUFFER_SIZE)
  latestMicro?: MicrostructureEvent;
  latestProb?: ProbabilityEvent;
  latestDrift?: DriftEvent;
  latestParticipant?: ParticipantFlowEvent;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export class MarketMemoryService {
  private readonly states: Map<string, ContractMemoryState> = new Map();
  private readonly latest: Map<string, MarketMemoryEvent> = new Map();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MicrostructureEvent>(EVENTS.MICROSTRUCTURE, safeHandler((e) => {
      const s = this.getOrCreate(e.contractId);
      s.latestMicro = e;
      this.tryEmit(e.contractId);
    }, 'MarketMemory.micro'));

    this.bus.on<ProbabilityEvent>(EVENTS.PROBABILITY, safeHandler((e) => {
      const s = this.getOrCreate(e.contractId);
      s.latestProb = e;
    }, 'MarketMemory.probability'));

    this.bus.on<DriftEvent>(EVENTS.DRIFT_EVENT, safeHandler((e) => {
      const s = this.getOrCreate(e.contractId);
      s.latestDrift = e;
    }, 'MarketMemory.drift'));

    this.bus.on<ParticipantFlowEvent>(EVENTS.PARTICIPANT_FLOW, safeHandler((e) => {
      const s = this.getOrCreate(e.contractId);
      s.latestParticipant = e;
    }, 'MarketMemory.participant'));
  }

  getLatestMemory(contractId: string): MarketMemoryEvent | undefined {
    return this.latest.get(contractId);
  }

  private getOrCreate(contractId: string): ContractMemoryState {
    if (!this.states.has(contractId)) {
      this.states.set(contractId, {
        buffer: new Array<RegimeFingerprint>(BUFFER_SIZE),
        writeHead: 0, count: 0,
      });
    }
    return this.states.get(contractId)!;
  }

  private tryEmit(contractId: string): void {
    const s = this.states.get(contractId);
    if (!s?.latestMicro) return;

    const micro = s.latestMicro;
    const estimatedProb = s.latestProb?.estimatedProbability ?? 0.5;
    const driftSev = s.latestDrift?.severity ?? 'none';
    const driftSeverityCode = DRIFT_CODE[driftSev] ?? 0;
    const dominantType = s.latestParticipant?.dominant ?? 'momentum';
    const participantDominantCode = PARTICIPANT_CODE[dominantType] ?? 1;

    const fp: RegimeFingerprint = {
      obi: micro.obi,
      sweepProbability: micro.sweepProbability,
      estimatedProb,
      driftSeverityCode,
      participantDominantCode,
      timestamp: micro.timestamp,
    };

    // Write fingerprint to ring buffer
    s.buffer[s.writeHead] = fp;
    s.writeHead = (s.writeHead + 1) % BUFFER_SIZE;
    s.count = Math.min(s.count + 1, BUFFER_SIZE);

    // Pattern matching: find last 10 fingerprints with same driftSeverityCode
    const matches: Array<{ fp: RegimeFingerprint; idx: number }> = [];
    const currentHead = (s.writeHead - 1 + BUFFER_SIZE) % BUFFER_SIZE;

    for (let i = 1; i < s.count && matches.length < 10; i++) {
      const idx = (currentHead - i + BUFFER_SIZE) % BUFFER_SIZE;
      const candidate = s.buffer[idx];
      if (candidate && candidate.driftSeverityCode === driftSeverityCode) {
        matches.push({ fp: candidate, idx });
      }
    }

    let recurrenceScore = 0;
    let stressPatternMatch = false;
    let historicalOutcomeSignal = 0;

    if (matches.length >= 3) {
      const currentVec = [fp.obi, fp.sweepProbability, fp.estimatedProb];
      const sims = matches.map(({ fp: mfp }) =>
        cosine(currentVec, [mfp.obi, mfp.sweepProbability, mfp.estimatedProb]),
      );
      recurrenceScore = Number((sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(4));
      stressPatternMatch = matches.some((m) => m.fp.sweepProbability > 0.6);

      // Estimate historical outcome: what did estimatedProb do after similar states
      const outcomes = matches.map(({ idx }) => {
        const futureIdx = (idx + 3) % BUFFER_SIZE;
        const future = s.buffer[futureIdx];
        return future ? future.estimatedProb - s.buffer[idx]!.estimatedProb : 0;
      });
      const rawSignal = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
      historicalOutcomeSignal = Number(Math.max(-1, Math.min(1, rawSignal * 10)).toFixed(4));
    }

    const obiLabel = micro.obi > 0.5 ? 'H' : micro.obi > 0 ? 'M' : micro.obi > -0.5 ? 'N' : 'L';
    const sweepLabel = micro.sweepProbability > 0.7 ? 'H' : micro.sweepProbability > 0.4 ? 'M' : 'L';
    const regimeSignature = `obi:${obiLabel}|sweep:${sweepLabel}|drift:${driftSev}|dom:${dominantType}`;

    const event: MarketMemoryEvent = {
      contractId,
      recurrenceScore,
      stressPatternMatch,
      historicalOutcomeSignal,
      regimeSignature,
      memoryDepth: s.count,
      timestamp: Date.now(),
    };

    this.latest.set(contractId, event);
    this.bus.emit<MarketMemoryEvent>(EVENTS.MARKET_MEMORY, event);
  }
}
