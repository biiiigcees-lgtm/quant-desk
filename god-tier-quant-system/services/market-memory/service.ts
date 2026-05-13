import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
import {
  DriftEvent,
  MarketMemoryEvent,
  MarketExperienceEvent,
  MicrostructureEvent,
  ParticipantFlowEvent,
  ParticipantType,
  ProbabilityEvent,
  ReplayIntegrityEvent,
  ValidationResultEvent,
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
  replayDeterministic: boolean;
  failureSignalScore: number;
}

interface MatchAnalysis {
  recurrenceScore: number;
  stressPatternMatch: boolean;
  historicalOutcomeSignal: number;
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

    this.bus.on<ReplayIntegrityEvent>(EVENTS.REPLAY_INTEGRITY, safeHandler((e) => {
      const s = this.getOrCreate('global');
      s.replayDeterministic = e.deterministic;
      if (!e.deterministic) {
        s.failureSignalScore = clamp(s.failureSignalScore + 0.2, 0, 1);
      }
    }, 'MarketMemory.replay'));

    this.bus.on<ValidationResultEvent>(EVENTS.VALIDATION_RESULT, safeHandler((e) => {
      if (e.status === 'fail') {
        const s = this.getOrCreate(e.contractId);
        const penalty = e.kind === 'adversarial' ? 0.18 : 0.1;
        s.failureSignalScore = clamp(s.failureSignalScore + penalty, 0, 1);
      }
      if (e.status === 'pass') {
        const s = this.getOrCreate(e.contractId);
        s.failureSignalScore = clamp(s.failureSignalScore - 0.06, 0, 1);
      }
    }, 'MarketMemory.validation'));
  }

  getLatestMemory(contractId: string): MarketMemoryEvent | undefined {
    return this.latest.get(contractId);
  }

  private getOrCreate(contractId: string): ContractMemoryState {
    const existing = this.states.get(contractId);
    if (existing) {
      return existing;
    }

    const created: ContractMemoryState = {
        buffer: new Array<RegimeFingerprint>(BUFFER_SIZE),
        writeHead: 0, count: 0,
        replayDeterministic: true,
        failureSignalScore: 0,
      };
    this.states.set(contractId, created);
    return created;
  }

  private tryEmit(contractId: string): void {
    const s = this.states.get(contractId);
    if (!s?.latestMicro) return;

    const micro = s.latestMicro;
    const { fingerprint, driftSev, dominantType } = this.buildFingerprint(s, micro);
    this.writeFingerprint(s, fingerprint);

    const { recurrenceScore, stressPatternMatch, historicalOutcomeSignal } = this.analyzeMatches(
      s,
      fingerprint,
    );

    const regimeSignature = buildRegimeSignature(micro, driftSev, dominantType);

    const event: MarketMemoryEvent = {
      contractId,
      recurrenceScore,
      stressPatternMatch,
      historicalOutcomeSignal,
      regimeSignature,
      memoryDepth: s.count,
      timestamp: micro.timestamp,
    };

    const failureSignalScore = this.computeFailureSignalScore(s);
    const traumaPenalty = computeTraumaPenalty(failureSignalScore, stressPatternMatch, historicalOutcomeSignal);
    const recurringFailureSignature =
      traumaPenalty > 0.45 &&
      (stressPatternMatch || historicalOutcomeSignal < -0.12 || recurrenceScore > 0.72);

    const archetype = inferArchetype(regimeSignature, historicalOutcomeSignal, stressPatternMatch);
    const experience: MarketExperienceEvent = {
      contractId,
      archetype,
      recurringFailureSignature,
      traumaPenalty: Number(traumaPenalty.toFixed(4)),
      retrievalConfidence: Number(computeRetrievalConfidence(recurrenceScore, stressPatternMatch).toFixed(4)),
      timestamp: event.timestamp,
    };

    this.latest.set(contractId, event);
    this.bus.emit<MarketMemoryEvent>(EVENTS.MARKET_MEMORY, event);
    this.bus.emit<MarketExperienceEvent>(EVENTS.MARKET_EXPERIENCE, experience);
  }

  private buildFingerprint(
    state: ContractMemoryState,
    micro: MicrostructureEvent,
  ): { fingerprint: RegimeFingerprint; driftSev: string; dominantType: ParticipantType } {
    const estimatedProb = state.latestProb?.estimatedProbability ?? 0.5;
    const driftSev = state.latestDrift?.severity ?? 'none';
    const dominantType = state.latestParticipant?.dominant ?? 'momentum';

    return {
      driftSev,
      dominantType,
      fingerprint: {
        obi: micro.obi,
        sweepProbability: micro.sweepProbability,
        estimatedProb,
        driftSeverityCode: DRIFT_CODE[driftSev] ?? 0,
        participantDominantCode: PARTICIPANT_CODE[dominantType] ?? 1,
        timestamp: micro.timestamp,
      },
    };
  }

  private writeFingerprint(state: ContractMemoryState, fingerprint: RegimeFingerprint): void {
    state.buffer[state.writeHead] = fingerprint;
    state.writeHead = (state.writeHead + 1) % BUFFER_SIZE;
    state.count = Math.min(state.count + 1, BUFFER_SIZE);
  }

  private analyzeMatches(state: ContractMemoryState, current: RegimeFingerprint): MatchAnalysis {
    const matches = this.findRecentMatches(state, current.driftSeverityCode, 10);
    if (matches.length < 3) {
      return {
        recurrenceScore: 0,
        stressPatternMatch: false,
        historicalOutcomeSignal: 0,
      };
    }

    const currentVec = [current.obi, current.sweepProbability, current.estimatedProb];
    const similarities = matches.map(({ fp }) => cosine(currentVec, [fp.obi, fp.sweepProbability, fp.estimatedProb]));
    const recurrenceScore = Number((similarities.reduce((a, b) => a + b, 0) / similarities.length).toFixed(4));
    const stressPatternMatch = matches.some(({ fp }) => fp.sweepProbability > 0.6);

    const outcomes = matches.map(({ fp, idx }) => {
      const future = state.buffer[(idx + 3) % BUFFER_SIZE];
      if (!future) {
        return 0;
      }
      return future.estimatedProb - fp.estimatedProb;
    });
    const rawSignal = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
    const historicalOutcomeSignal = Number(clamp(rawSignal * 10, -1, 1).toFixed(4));

    return {
      recurrenceScore,
      stressPatternMatch,
      historicalOutcomeSignal,
    };
  }

  private findRecentMatches(
    state: ContractMemoryState,
    driftSeverityCode: number,
    maxMatches: number,
  ): Array<{ fp: RegimeFingerprint; idx: number }> {
    const matches: Array<{ fp: RegimeFingerprint; idx: number }> = [];
    const currentHead = (state.writeHead - 1 + BUFFER_SIZE) % BUFFER_SIZE;

    for (let i = 1; i < state.count && matches.length < maxMatches; i++) {
      const idx = (currentHead - i + BUFFER_SIZE) % BUFFER_SIZE;
      const candidate = state.buffer[idx];
      if (candidate?.driftSeverityCode === driftSeverityCode) {
        matches.push({ fp: candidate, idx });
      }
    }

    return matches;
  }

  private computeFailureSignalScore(state: ContractMemoryState): number {
    const replayState = this.states.get('global');
    const replayPenalty = replayState?.replayDeterministic === false ? 0.15 : 0;
    return clamp(state.failureSignalScore + replayPenalty, 0, 1);
  }
}

function buildRegimeSignature(
  micro: MicrostructureEvent,
  driftSev: string,
  dominantType: ParticipantType,
): string {
  const obiLabel = obiBucketLabel(micro.obi);
  const sweepLabel = sweepBucketLabel(micro.sweepProbability);
  return `obi:${obiLabel}|sweep:${sweepLabel}|drift:${driftSev}|dom:${dominantType}`;
}

function obiBucketLabel(obi: number): 'H' | 'M' | 'N' | 'L' {
  if (obi > 0.5) {
    return 'H';
  }
  if (obi > 0) {
    return 'M';
  }
  if (obi > -0.5) {
    return 'N';
  }
  return 'L';
}

function sweepBucketLabel(sweepProbability: number): 'H' | 'M' | 'L' {
  if (sweepProbability > 0.7) {
    return 'H';
  }
  if (sweepProbability > 0.4) {
    return 'M';
  }
  return 'L';
}

function computeTraumaPenalty(
  failureSignalScore: number,
  stressPatternMatch: boolean,
  historicalOutcomeSignal: number,
): number {
  return clamp(
    failureSignalScore * 0.7 +
    (stressPatternMatch ? 0.15 : 0) +
    (historicalOutcomeSignal < -0.1 ? 0.15 : 0),
    0,
    1,
  );
}

function computeRetrievalConfidence(recurrenceScore: number, stressPatternMatch: boolean): number {
  const stressBonus = stressPatternMatch ? 0.2 : 0;
  return clamp((recurrenceScore + stressBonus) / 1.2, 0, 1);
}

function inferArchetype(regimeSignature: string, historicalOutcomeSignal: number, stressPatternMatch: boolean): string {
  if (regimeSignature.includes('drift:high') && stressPatternMatch) {
    return 'drift-shock-fragility';
  }
  if (regimeSignature.includes('dom:panic-flow')) {
    return 'panic-liquidity-vacuum';
  }
  if (historicalOutcomeSignal > 0.1) {
    return 'momentum-continuation-memory';
  }
  if (historicalOutcomeSignal < -0.1) {
    return 'mean-reversion-trap';
  }
  return 'balanced-transitional';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
