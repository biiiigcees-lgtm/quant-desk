import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const SPOOF_WINDOW_MS = 2000;
const WALL_SIZE_THRESHOLD = 300;
const ICEBERG_REFILL_THRESHOLD = 3;
const LEVEL_KEY = (side, price) => `${side}:${price.toFixed(4)}`;
export class OrderbookDeltaService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
    }
    start() {
        this.bus.on(EVENTS.MARKET_DATA, safeHandler((e) => {
            this.process(e);
        }, 'OrderbookDelta'));
    }
    process(e) {
        const prev = this.state.get(e.contractId) ?? this.emptyState();
        const now = e.timestamp;
        const bidAdded = [];
        const bidRemoved = [];
        const askAdded = [];
        const askRemoved = [];
        const spoofedBids = [];
        const spoofedAsks = [];
        const inferredIcebergBids = [];
        const inferredIcebergAsks = [];
        const newBids = new Map(e.bidLevels);
        const newAsks = new Map(e.askLevels);
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
                }
                else {
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
                }
                else {
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
            if (hist.goneAt !== null && now - hist.goneAt > 30000) {
                prev.history.delete(key);
            }
        }
        const next = {
            bids: newBids,
            asks: newAsks,
            history: prev.history,
            lastSpread: e.spread,
            lastSpreadMs: now,
            updatedAt: now,
        };
        this.state.set(e.contractId, next);
        const event = {
            contractId: e.contractId,
            bidAdded, bidRemoved, askAdded, askRemoved,
            spoofedBids, spoofedAsks,
            inferredIcebergBids, inferredIcebergAsks,
            netBidDelta, netAskDelta,
            liquidityRefillRate,
            spreadMicroDynamics,
            timestamp: now,
        };
        this.bus.emit(EVENTS.ORDERBOOK_DELTA, event);
    }
    emptyState() {
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
