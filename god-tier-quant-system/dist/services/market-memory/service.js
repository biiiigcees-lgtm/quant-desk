import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const BUFFER_SIZE = 200;
const DRIFT_CODE = { none: 0, low: 1, medium: 2, high: 3 };
const PARTICIPANT_CODE = {
    'liquidity-provider': 0,
    'momentum': 1,
    'panic-flow': 2,
    'arbitrage': 3,
    'trapped-trader': 4,
};
function cosine(a, b) {
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
    constructor(bus) {
        this.bus = bus;
        this.states = new Map();
        this.latest = new Map();
    }
    start() {
        this.bus.on(EVENTS.MICROSTRUCTURE, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.latestMicro = e;
            this.tryEmit(e.contractId);
        }, 'MarketMemory.micro'));
        this.bus.on(EVENTS.PROBABILITY, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.latestProb = e;
        }, 'MarketMemory.probability'));
        this.bus.on(EVENTS.DRIFT_EVENT, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.latestDrift = e;
        }, 'MarketMemory.drift'));
        this.bus.on(EVENTS.PARTICIPANT_FLOW, safeHandler((e) => {
            const s = this.getOrCreate(e.contractId);
            s.latestParticipant = e;
        }, 'MarketMemory.participant'));
    }
    getLatestMemory(contractId) {
        return this.latest.get(contractId);
    }
    getOrCreate(contractId) {
        if (!this.states.has(contractId)) {
            this.states.set(contractId, {
                buffer: new Array(BUFFER_SIZE),
                writeHead: 0, count: 0,
            });
        }
        return this.states.get(contractId);
    }
    tryEmit(contractId) {
        const s = this.states.get(contractId);
        if (!s?.latestMicro)
            return;
        const micro = s.latestMicro;
        const estimatedProb = s.latestProb?.estimatedProbability ?? 0.5;
        const driftSev = s.latestDrift?.severity ?? 'none';
        const driftSeverityCode = DRIFT_CODE[driftSev] ?? 0;
        const dominantType = s.latestParticipant?.dominant ?? 'momentum';
        const participantDominantCode = PARTICIPANT_CODE[dominantType] ?? 1;
        const fp = {
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
        const matches = [];
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
            const sims = matches.map(({ fp: mfp }) => cosine(currentVec, [mfp.obi, mfp.sweepProbability, mfp.estimatedProb]));
            recurrenceScore = Number((sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(4));
            stressPatternMatch = matches.some((m) => m.fp.sweepProbability > 0.6);
            // Estimate historical outcome: what did estimatedProb do after similar states
            const outcomes = matches.map(({ idx }) => {
                const futureIdx = (idx + 3) % BUFFER_SIZE;
                const future = s.buffer[futureIdx];
                return future ? future.estimatedProb - s.buffer[idx].estimatedProb : 0;
            });
            const rawSignal = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
            historicalOutcomeSignal = Number(Math.max(-1, Math.min(1, rawSignal * 10)).toFixed(4));
        }
        const obiLabel = micro.obi > 0.5 ? 'H' : micro.obi > 0 ? 'M' : micro.obi > -0.5 ? 'N' : 'L';
        const sweepLabel = micro.sweepProbability > 0.7 ? 'H' : micro.sweepProbability > 0.4 ? 'M' : 'L';
        const regimeSignature = `obi:${obiLabel}|sweep:${sweepLabel}|drift:${driftSev}|dom:${dominantType}`;
        const event = {
            contractId,
            recurrenceScore,
            stressPatternMatch,
            historicalOutcomeSignal,
            regimeSignature,
            memoryDepth: s.count,
            timestamp: Date.now(),
        };
        this.latest.set(contractId, event);
        this.bus.emit(EVENTS.MARKET_MEMORY, event);
    }
}
