// ╔══════════════════════════════════════════════════════╗
// ║  QUANT//DESK — RealtimeEventQueue                  ║
// ║  Deterministic ingest queue + frame coalescing.    ║
// ╚══════════════════════════════════════════════════════╝

const DEFAULT_MAX_TRADES_PER_COMMIT = 24;
const DEFAULT_MAX_PENDING_TRADES = 120;
const DEFAULT_DEDUPE_TTL_MS = 15_000;

export class RealtimeEventQueue {
  #onCommit;
  #maxTradesPerCommit;
  #maxPendingTrades;
  #dedupeTtlMs;

  #pendingTicker = null;
  #pendingSnapshot = null;
  #pendingL2 = new Map();
  #pendingTrades = [];
  #oldestPendingReceivedAt = null;

  #lastTickerExchangeTs = 0;
  #lastL2ExchangeTs = 0;
  #lastTradeExchangeTs = 0;

  #seenKeys = new Map();
  #flushScheduled = false;

  #metrics = {
    enqueuedCount: 0,
    commitCount: 0,
    droppedDuplicateCount: 0,
    droppedStaleCount: 0,
    queueDepth: 0,
    maxQueueDepth: 0,
    lastCommitLatencyMs: 0,
    lastFlushDurationMs: 0,
  };

  constructor({
    onCommit,
    maxTradesPerCommit = DEFAULT_MAX_TRADES_PER_COMMIT,
    maxPendingTrades = DEFAULT_MAX_PENDING_TRADES,
    dedupeTtlMs = DEFAULT_DEDUPE_TTL_MS,
  } = {}) {
    this.#onCommit = typeof onCommit === 'function' ? onCommit : null;
    this.#maxTradesPerCommit = Math.max(1, maxTradesPerCommit);
    this.#maxPendingTrades = Math.max(this.#maxTradesPerCommit, maxPendingTrades);
    this.#dedupeTtlMs = Math.max(1_000, dedupeTtlMs);
  }

  enqueue(event, receivedAt = Date.now()) {
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
      return;
    }

    this.#pruneSeenKeys(receivedAt);

    if (this.#isStaleEvent(event)) {
      this.#metrics.droppedStaleCount += 1;
      return;
    }

    const dedupeKey = this.#buildDedupeKey(event);
    if (dedupeKey && this.#seenKeys.has(dedupeKey)) {
      this.#metrics.droppedDuplicateCount += 1;
      return;
    }
    if (dedupeKey) {
      this.#seenKeys.set(dedupeKey, receivedAt);
    }

    this.#enqueueByType(event);

    if (this.#oldestPendingReceivedAt === null || receivedAt < this.#oldestPendingReceivedAt) {
      this.#oldestPendingReceivedAt = receivedAt;
    }

    this.#metrics.enqueuedCount += 1;
    this.#syncQueueDepthMetrics();
    this.#scheduleFlush();
  }

  flushNow() {
    this.#flush();
  }

  getMetrics() {
    return { ...this.#metrics };
  }

  #enqueueByType(event) {
    switch (event.type) {
      case 'ticker':
        this.#pendingTicker = event;
        break;
      case 'snapshot':
        this.#pendingSnapshot = event;
        break;
      case 'l2update':
        this.#appendL2Changes(event.changes);
        break;
      case 'match':
      case 'last_match':
        this.#pendingTrades.push(event);
        if (this.#pendingTrades.length > this.#maxPendingTrades) {
          this.#pendingTrades.shift();
        }
        break;
      default:
        break;
    }
  }

  #appendL2Changes(changes) {
    if (!Array.isArray(changes)) {
      return;
    }

    for (const change of changes) {
      if (!Array.isArray(change) || change.length < 3) {
        continue;
      }
      const side = change[0];
      const price = change[1];
      const size = change[2];
      const key = `${side}:${price}`;
      this.#pendingL2.set(key, [side, price, size]);
    }
  }

  #scheduleFlush() {
    if (this.#flushScheduled) {
      return;
    }

    this.#flushScheduled = true;
    const run = () => {
      this.#flushScheduled = false;
      this.#flush();
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(run);
      return;
    }

    setTimeout(run, 0);
  }

  #flush() {
    const queueDepth = this.#computeQueueDepth();
    if (queueDepth === 0) {
      this.#metrics.queueDepth = 0;
      return;
    }

    const flushStarted = nowMs();
    const committedAt = Date.now();
    const oldestReceivedAt = this.#oldestPendingReceivedAt;

    const payload = {
      ticker: this.#pendingTicker,
      snapshot: this.#pendingSnapshot,
      l2changes: [...this.#pendingL2.values()],
      trades: this.#pendingTrades.slice(-this.#maxTradesPerCommit),
      committedAt,
      oldestReceivedAt,
    };

    this.#pendingTicker = null;
    this.#pendingSnapshot = null;
    this.#pendingL2.clear();
    this.#pendingTrades = [];
    this.#oldestPendingReceivedAt = null;

    this.#metrics.commitCount += 1;
    this.#metrics.lastFlushDurationMs = Math.max(0, nowMs() - flushStarted);
    this.#metrics.lastCommitLatencyMs = oldestReceivedAt ? Math.max(0, committedAt - oldestReceivedAt) : 0;
    this.#syncQueueDepthMetrics();

    if (this.#onCommit) {
      this.#onCommit(payload, this.getMetrics());
    }
  }

  #buildDedupeKey(event) {
    switch (event.type) {
      case 'ticker':
        return `ticker:${event.time ?? ''}:${event.price ?? ''}:${event.sequence ?? ''}`;
      case 'snapshot':
        return `snapshot:${event.time ?? ''}:${event.product_id ?? ''}:${event.bids?.length ?? 0}:${event.asks?.length ?? 0}`;
      case 'match':
      case 'last_match':
        return `trade:${event.trade_id ?? ''}:${event.time ?? ''}:${event.price ?? ''}:${event.size ?? ''}`;
      default:
        return null;
    }
  }

  #isStaleEvent(event) {
    const exchangeTs = toEpochMs(event.time);
    if (!exchangeTs) {
      return false;
    }

    switch (event.type) {
      case 'ticker': {
        if (exchangeTs <= this.#lastTickerExchangeTs) {
          return true;
        }
        this.#lastTickerExchangeTs = exchangeTs;
        return false;
      }
      case 'l2update': {
        if (exchangeTs <= this.#lastL2ExchangeTs) {
          return true;
        }
        this.#lastL2ExchangeTs = exchangeTs;
        return false;
      }
      case 'match':
      case 'last_match': {
        if (exchangeTs < this.#lastTradeExchangeTs) {
          return true;
        }
        this.#lastTradeExchangeTs = exchangeTs;
        return false;
      }
      default:
        return false;
    }
  }

  #pruneSeenKeys(now) {
    const cutoff = now - this.#dedupeTtlMs;
    for (const [key, seenAt] of this.#seenKeys.entries()) {
      if (seenAt < cutoff) {
        this.#seenKeys.delete(key);
      }
    }
  }

  #computeQueueDepth() {
    return (
      (this.#pendingTicker ? 1 : 0)
      + (this.#pendingSnapshot ? 1 : 0)
      + this.#pendingL2.size
      + this.#pendingTrades.length
    );
  }

  #syncQueueDepthMetrics() {
    const depth = this.#computeQueueDepth();
    this.#metrics.queueDepth = depth;
    if (depth > this.#metrics.maxQueueDepth) {
      this.#metrics.maxQueueDepth = depth;
    }
  }
}

function toEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function nowMs() {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
}
