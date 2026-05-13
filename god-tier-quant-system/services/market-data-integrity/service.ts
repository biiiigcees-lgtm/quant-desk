import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { MarketDataEvent, MarketDataIntegrityEvent } from '../../core/schemas/events.js';

interface FeedState {
  lastSourceTimestamp: number;
  lastReceiveTimestamp: number;
  packetGapCount: number;
  corruptionCount: number;
}

export class MarketDataIntegrityService {
  private readonly states = new Map<string, FeedState>();

  constructor(
    private readonly bus: EventBus,
    private readonly expectedIntervalMs: number = 250,
  ) {}

  start(): void {
    this.bus.on<MarketDataEvent>(EVENTS.MARKET_DATA, (event) => {
      const receiveTimestamp = Date.now();
      const state = this.states.get(event.contractId) ?? {
        lastSourceTimestamp: event.timestamp,
        lastReceiveTimestamp: receiveTimestamp,
        packetGapCount: 0,
        corruptionCount: 0,
      };

      const reasons: string[] = [];
      const sourceDeltaMs = Math.max(0, event.timestamp - state.lastSourceTimestamp);
      const observedGapMs = Math.max(0, receiveTimestamp - state.lastReceiveTimestamp);
      const staleAgeMs = Math.max(0, receiveTimestamp - event.timestamp);
      const sourceClockSkewMs = Math.abs(receiveTimestamp - event.timestamp);

      if (sourceDeltaMs > this.expectedIntervalMs * 1.8 || observedGapMs > this.expectedIntervalMs * 2.2) {
        state.packetGapCount += 1;
        reasons.push('packet-gap');
      }

      if (staleAgeMs > this.expectedIntervalMs * 3) {
        reasons.push('stale-feed');
      }

      const corrupted =
        !Number.isFinite(event.yesPrice) ||
        !Number.isFinite(event.noPrice) ||
        !Number.isFinite(event.spread) ||
        event.yesPrice < 0 ||
        event.noPrice < 0 ||
        event.spread < 0 ||
        event.yesPrice > 1 ||
        event.noPrice > 1 ||
        Math.abs(event.yesPrice + event.noPrice - 1) > 0.2;

      if (corrupted) {
        state.corruptionCount += 1;
        reasons.push('corrupted-event');
      }

      if (sourceClockSkewMs > 2_500) {
        reasons.push('clock-skew');
      }

      const latencyMs = staleAgeMs;
      const latencyPenalty = clamp01(latencyMs / 1500);
      const gapPenalty = clamp01(state.packetGapCount / 8) * 0.5;
      const corruptionPenalty = clamp01(state.corruptionCount / 4) * 0.7;
      const stalePenalty = staleAgeMs > this.expectedIntervalMs * 3 ? 0.25 : 0;
      const skewPenalty = sourceClockSkewMs > 2_500 ? 0.2 : 0;

      const healthScore = clamp01(1 - latencyPenalty * 0.35 - gapPenalty - corruptionPenalty - stalePenalty - skewPenalty);
      const degraded = healthScore < 0.58;

      const integrityEvent: MarketDataIntegrityEvent = {
        contractId: event.contractId,
        healthScore,
        degraded,
        reasons,
        observedGapMs,
        staleAgeMs,
        latencyMs,
        sourceClockSkewMs,
        packetGapCount: state.packetGapCount,
        corruptionCount: state.corruptionCount,
        timestamp: receiveTimestamp,
      };

      this.bus.emit(EVENTS.MARKET_DATA_INTEGRITY, integrityEvent, {
        source: 'market-data-integrity',
        snapshotId: event.contractId,
        idempotencyKey: `mdi:${event.contractId}:${event.timestamp}`,
        timestamp: receiveTimestamp,
      });

      state.lastSourceTimestamp = event.timestamp;
      state.lastReceiveTimestamp = receiveTimestamp;
      this.states.set(event.contractId, state);
    });
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
