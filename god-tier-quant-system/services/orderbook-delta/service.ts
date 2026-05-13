import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
import type { MarketDataEvent, OrderbookDeltaEvent } from '../../core/schemas/events.js';

interface LevelHistory {
  size: number;
  seenAt: number;
  goneAt: number | null;
  refillCount: number;
}

interface BookState {
  bids: Map<number, number>;
  asks: Map<number, number>;
  history: Map<string, LevelHistory>;
  lastSpreadMs: number;
  lastSpread: number;
  updatedAt: number;
}

const SPOOF_WINDOW_MS = 2000;
const WALL_SIZE_THRESHOLD = 300;
const ICEBERG_REFILL_THRESHOLD = 3;
const LEVEL_KEY = (side: 'b' | 'a', price: number) => `${side}:${price.toFixed(4)}`;

export class OrderbookDeltaService {
  private readonly state = new Map<string, BookState>();

  constructor(private readonly bus: EventBus) {}

  start(): void {
    this.bus.on<MarketDataEvent>(EVENTS.MARKET_DATA, safeHandler((e) => {
      this.process(e);
    }, 'OrderbookDelta'));
  }

  private process(e: MarketDataEvent): void {
    const prev = this.state.get(e.contractId) ?? this.emptyState();
    const now = e.timestamp;

    const bidAdded: Array<[number, number]> = [];
    const bidRemoved: Array<[number, number]> = [];
    const askAdded: Array<[number, number]> = [];
    const askRemoved: Array<[number, number]> = [];
    const spoofedBids: number[] = [];
    const spoofedAsks: number[] = [];
    const inferredIcebergBids: number[] = [];
    const inferredIcebergAsks: number[] = [];

    const newBids = new Map<number, number>(e.bidLevels);
    const newAsks = new Map<number, number>(e.askLevels);

    // Compute bid deltas
    for (const [price, size] of newBids) {
      if (!prev.bids.has(price)) {
        bidAdded.push([price, size]);
        const key = LEVEL_KEY('b', price);
        const hist = prev.history.get(key);
        if (hist) {
          hist.refillCount++;
          hist.goneAt = null;
          hist.size = size;
          hist.seenAt = now;
          if (hist.refillCount >= ICEBERG_REFILL_THRESHOLD) {
            inferredIcebergBids.push(price);
          }
        } else {
          prev.history.set(key, { size, seenAt: now, goneAt: null, refillCount: 0 });
        }
      }
    }
    for (const [price, size] of prev.bids) {
      if (!newBids.has(price)) {
        bidRemoved.push([price, size]);
        const key = LEVEL_KEY('b', price);
        const hist = prev.history.get(key);
        if (hist) {
          hist.goneAt = now;
          if (size >= WALL_SIZE_THRESHOLD && now - hist.seenAt < SPOOF_WINDOW_MS) {
            spoofedBids.push(price);
          }
        }
      }
    }

    // Compute ask deltas
    for (const [price, size] of newAsks) {
      if (!prev.asks.has(price)) {
        askAdded.push([price, size]);
        const key = LEVEL_KEY('a', price);
        const hist = prev.history.get(key);
        if (hist) {
          hist.refillCount++;
          hist.goneAt = null;
          hist.size = size;
          hist.seenAt = now;
          if (hist.refillCount >= ICEBERG_REFILL_THRESHOLD) {
            inferredIcebergAsks.push(price);
          }
        } else {
          prev.history.set(key, { size, seenAt: now, goneAt: null, refillCount: 0 });
        }
      }
    }
    for (const [price, size] of prev.asks) {
      if (!newAsks.has(price)) {
        askRemoved.push([price, size]);
        const key = LEVEL_KEY('a', price);
        const hist = prev.history.get(key);
        if (hist) {
          hist.goneAt = now;
          if (size >= WALL_SIZE_THRESHOLD && now - hist.seenAt < SPOOF_WINDOW_MS) {
            spoofedAsks.push(price);
          }
        }
      }
    }

    const netBidDelta = bidAdded.reduce((s, [, v]) => s + v, 0) - bidRemoved.reduce((s, [, v]) => s + v, 0);
    const netAskDelta = askAdded.reduce((s, [, v]) => s + v, 0) - askRemoved.reduce((s, [, v]) => s + v, 0);

    const totalAdded = bidAdded.length + askAdded.length;
    const liquidityRefillRate = totalAdded === 0 ? 0 :
      Math.min(1, (inferredIcebergBids.length + inferredIcebergAsks.length) / Math.max(1, totalAdded));

    const dtMs = prev.updatedAt > 0 ? now - prev.updatedAt : 250;
    const spreadMicroDynamics = dtMs > 0 ? (e.spread - prev.lastSpread) / (dtMs / 1000) : 0;

    // Prune stale history entries (older than 30s)
    for (const [key, hist] of prev.history) {
      if (hist.goneAt !== null && now - hist.goneAt > 30_000) {
        prev.history.delete(key);
      }
    }

    const next: BookState = {
      bids: newBids,
      asks: newAsks,
      history: prev.history,
      lastSpread: e.spread,
      lastSpreadMs: now,
      updatedAt: now,
    };
    this.state.set(e.contractId, next);

    const event: OrderbookDeltaEvent = {
      contractId: e.contractId,
      bidAdded, bidRemoved, askAdded, askRemoved,
      spoofedBids, spoofedAsks,
      inferredIcebergBids, inferredIcebergAsks,
      netBidDelta, netAskDelta,
      liquidityRefillRate,
      spreadMicroDynamics,
      timestamp: now,
    };
    this.bus.emit<OrderbookDeltaEvent>(EVENTS.ORDERBOOK_DELTA, event);
  }

  private emptyState(): BookState {
    return {
      bids: new Map(),
      asks: new Map(),
      history: new Map(),
      lastSpread: 0,
      lastSpreadMs: 0,
      updatedAt: 0,
    };
  }
}
