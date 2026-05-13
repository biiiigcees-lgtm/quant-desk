// ╔══════════════════════════════════════════════════════╗
// ║  QUANT//DESK — CoinbaseWS                           ║
// ║  Coinbase live feed with REST recovery.             ║
// ╚══════════════════════════════════════════════════════╝

import { marketStore } from './marketStore.js';
import { RealtimeEventQueue } from './realtimeEventQueue.js';

const WS_URL = 'wss://ws-feed.exchange.coinbase.com';
const REST_TICKER_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';
const REST_BOOK_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/book?level=2';
const REST_TRADES_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=50';
const STALE_MS = 20000;

export class CoinbaseWS {
  ws = null;
  manualMode = 'auto';
  manualFallback = false;
  forceRest = false;
  reconnectAttempts = 0;
  pingInterval = null;
  connectTs = 0;
  _statusListeners = new Set();
  lastMsgTs = 0;
  staleTimer = null;
  restPollTimer = null;
  _staleTriggered = false;
  _restPolling = false;
  _lastTradeId = null;
  reconnectTimer = null;

  constructor() {
    this.eventQueue = new RealtimeEventQueue({
      onCommit: (queuedEvents, metrics) => {
        this._commitQueuedEvents(queuedEvents, metrics);
      },
    });
  }

  connect() {
    if (this.manualMode === 'rest') {
      this._clearReconnectTimer();
      this._enterRestOnlyMode();
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    this._clearReconnectTimer();
    this._enterAutoRestPolling();
    this._setStatus('connecting');

    let socket;
    try {
      socket = new WebSocket(WS_URL);
    } catch (error) {
      this._handleCaughtError('connect:new-websocket', error);
      this._setStatus('error');
      this._scheduleReconnect();
      return;
    }

    this.ws = socket;
    this.connectTs = Date.now();

    socket.onopen = () => {
      if (socket !== this.ws) return;
      if (this.manualMode === 'rest') {
        try { socket.close(); } catch (error) { this._handleCaughtError('onopen:close-rest-mode', error); }
        this._enterRestOnlyMode();
        return;
      }

      this._clearReconnectTimer();
      this.reconnectAttempts = 0;
      this.lastMsgTs = Date.now();
      this._staleTriggered = false;
      this._setStatus('connected');
      marketStore.setState({
        wsConnected: true,
        reconnectCount: 0,
        lastMsgTs: this.lastMsgTs,
        wsSource: 'coinbase',
        manualFallbackEnabled: false,
        manualRestEnabled: false,
      });

      socket.send(JSON.stringify({
        type: 'subscribe',
        product_ids: ['BTC-USD'],
        channels: ['ticker', 'level2_50', 'matches', 'heartbeat'],
      }));

      clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'heartbeat', on: true, product_ids: ['BTC-USD'] }));
        }
      }, 20000);

      this._startAutoHealthChecks();
    };

    socket.onmessage = (evt) => {
      if (socket !== this.ws) return;
      try {
        this.handleMessage(JSON.parse(evt.data));
      } catch (error) {
        this._handleCaughtError('ws:onmessage:parse-or-handle', error);
      }
    };

    socket.onerror = () => {
      if (socket !== this.ws) return;
      this._setStatus('error');
      try { socket.close(); } catch (error) { this._handleCaughtError('ws:onerror:close', error); }
    };

    socket.onclose = () => {
      const isActiveSocket = socket === this.ws;
      if (isActiveSocket) this.ws = null;
      if (!isActiveSocket) return;

      marketStore.setState({ wsConnected: false });
      clearInterval(this.pingInterval);
      clearInterval(this.staleTimer);

      if (this.manualMode === 'rest') {
        this._enterRestOnlyMode();
        return;
      }

      this._setStatus('error');
      this._enterAutoRestPolling();
      this._scheduleReconnect();
    };
  }

  reconnect() {
    this._clearReconnectTimer();
    if (this.manualMode === 'rest') {
      this.setManualMode('auto');
      return;
    }

    const activeSocket = this.ws;
    this.ws = null;
    if (activeSocket && activeSocket.readyState !== WebSocket.CLOSED) {
      try { activeSocket.close(); } catch (error) { this._handleCaughtError('reconnect:close', error); }
    }
    this.connect();
  }

  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  setManualFallback(enable) {
    if (enable) {
      this.reconnect();
      return;
    }
    this.setManualMode('auto');
  }

  setForceRest(enable) {
    this.setManualMode(enable ? 'rest' : 'auto');
  }

  setManualMode(mode) {
    const next = ['auto', 'rest'].includes(mode) ? mode : 'auto';
    this.manualMode = next;
    this.manualFallback = false;
    this.forceRest = next === 'rest';
    marketStore.setState({
      manualFallbackEnabled: false,
      manualRestEnabled: this.forceRest,
    });

    if (next === 'rest') {
      this._clearReconnectTimer();
      const activeSocket = this.ws;
      this.ws = null;
      if (activeSocket && activeSocket.readyState !== WebSocket.CLOSED) {
        try { activeSocket.close(); } catch (error) { this._handleCaughtError('setManualMode:rest:close', error); }
      }
      this._enterRestOnlyMode();
      return;
    }

    clearInterval(this.restPollTimer);
    this._startAutoHealthChecks();
    if (this.ws?.readyState !== WebSocket.OPEN) this.connect();
  }

  handleMessage(d) {
    this.lastMsgTs = Date.now();
    this.eventQueue.enqueue(d, this.lastMsgTs);
  }

  _commitQueuedEvents(queued, metrics) {
    const patch = {
      wsConnected: true,
      lastMsgTs: this.lastMsgTs,
      wsSource: 'coinbase',
      feedQueueDepth: metrics.queueDepth,
      feedDroppedStale: metrics.droppedStaleCount,
      feedDroppedDuplicate: metrics.droppedDuplicateCount,
      feedCommitCount: metrics.commitCount,
      feedMaxQueueDepth: metrics.maxQueueDepth,
      feedCommitLatencyMs: metrics.lastCommitLatencyMs,
      feedFlushDurationMs: metrics.lastFlushDurationMs,
    };

    if (queued.ticker) {
      Object.assign(patch, this._buildTickerPatch(queued.ticker));
    }
    marketStore.setState(patch);

    if (queued.snapshot?.bids && queued.snapshot?.asks) {
      marketStore.snapshotOrderbook(queued.snapshot.bids, queued.snapshot.asks);
    }

    if (Array.isArray(queued.l2changes) && queued.l2changes.length > 0) {
      marketStore.updateOrderbook(queued.l2changes);
    }

    if (Array.isArray(queued.trades) && queued.trades.length > 0) {
      const formattedTrades = [];
      for (const trade of queued.trades) {
        const formatted = this._formatTrade(trade);
        if (formatted) {
          formattedTrades.push(formatted);
        }
      }
      if (formattedTrades.length > 0) {
        marketStore.addTradesBatch(formattedTrades);
      }
    }
  }

  _buildTickerPatch(d) {
    const price = Number.parseFloat(d.price);
    if (!Number.isFinite(price) || price <= 0) return {};

    const bestBid = Number.parseFloat(d.best_bid);
    const bestAsk = Number.parseFloat(d.best_ask);
    const high24 = Number.parseFloat(d.high_24h);
    const low24 = Number.parseFloat(d.low_24h);
    const open24 = Number.parseFloat(d.open_24h);
    const vol24 = Number.parseFloat(d.volume_24h);
    const latency = d.time ? Math.max(0, Date.now() - new Date(d.time).getTime()) : 0;

    return this._buildMarketPatch({
      price,
      bestBid,
      bestAsk,
      high24,
      low24,
      open24,
      vol24,
      wsLatency: latency,
      wsConnected: true,
      lastMsgTs: this.lastMsgTs,
      wsSource: 'coinbase',
    });
  }

  _formatTrade(d) {
    const price = Number.parseFloat(d.price);
    const size = Number.parseFloat(d.size);
    if (!Number.isFinite(price) || price <= 0) return null;
    if (!Number.isFinite(size) || size <= 0) return null;

    return {
      price,
      size,
      side: d.side,
      time: d.time,
      ts: Date.now(),
    };
  }

  _scheduleReconnect() {
    if (this.manualMode !== 'auto') return;
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    marketStore.setState({ reconnectCount: this.reconnectAttempts });
    this._setStatus('connecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  _setStatus(status) {
    for (const fn of this._statusListeners) {
      try { fn(status); } catch (error) { this._handleCaughtError('status-listener', error); }
    }
  }

  _setSource(source) {
    if (!source) return;
    marketStore.setState({ wsSource: source });
  }

  _startAutoHealthChecks() {
    clearInterval(this.staleTimer);
    clearInterval(this.restPollTimer);

    this.staleTimer = setInterval(() => {
      if (this.manualMode !== 'auto') return;
      const age = Date.now() - this.lastMsgTs;
      if (age > STALE_MS && !this._staleTriggered) {
        this._staleTriggered = true;
        this._setStatus('error');
        marketStore.setState({ wsConnected: false });
        this._pollRestSnapshot();
        const activeSocket = this.ws;
        this.ws = null;
        if (activeSocket) {
          try { activeSocket.close(); } catch (error) { this._handleCaughtError('stale-timer:close-ws', error); }
        }
      } else if (age <= STALE_MS) {
        this._staleTriggered = false;
      }
    }, 5000);

    this._enterAutoRestPolling();
  }

  _enterAutoRestPolling() {
    clearInterval(this.restPollTimer);
    this.restPollTimer = setInterval(() => {
      if (this.manualMode !== 'auto') return;
      const socketOpen = this.ws?.readyState === WebSocket.OPEN;
      const age = Date.now() - this.lastMsgTs;
      if (!socketOpen || age > STALE_MS) this._pollRestSnapshot();
    }, 4000);
  }

  async _pollRestSnapshot() {
    if (this._restPolling) return;
    this._restPolling = true;
    try {
      const [tickerRes, bookRes, tradesRes] = await Promise.allSettled([
        fetch(REST_TICKER_URL, { signal: AbortSignal.timeout(4000) }),
        fetch(REST_BOOK_URL, { signal: AbortSignal.timeout(4000) }),
        fetch(REST_TRADES_URL, { signal: AbortSignal.timeout(4000) }),
      ]);
      await this._applyRestTickerSnapshot(tickerRes);
      await this._applyRestBookSnapshot(bookRes);
      await this._applyRestTradesSnapshot(tradesRes);
    } catch (error) {
      this._handleCaughtError('rest-snapshot:poll', error);
    } finally {
      this._restPolling = false;
    }
  }

  _buildMarketPatch({
    price,
    bestBid,
    bestAsk,
    high24,
    low24,
    open24,
    vol24,
    wsLatency,
    wsConnected,
    lastMsgTs,
    wsSource,
  }) {
    const patch = {};
    if (Number.isFinite(price) && price > 0) patch.price = price;
    if (Number.isFinite(wsLatency) && wsLatency >= 0) patch.wsLatency = wsLatency;
    if (typeof wsConnected === 'boolean') patch.wsConnected = wsConnected;
    if (Number.isFinite(lastMsgTs) && lastMsgTs > 0) patch.lastMsgTs = lastMsgTs;
    if (wsSource) patch.wsSource = wsSource;

    this._applyBookAnd24hPatch(patch, { bestBid, bestAsk, high24, low24, open24, vol24 });
    return patch;
  }

  _applyBookAnd24hPatch(patch, { bestBid, bestAsk, high24, low24, open24, vol24 }) {
    if (Number.isFinite(bestBid) && bestBid > 0) patch.bestBid = bestBid;
    if (Number.isFinite(bestAsk) && bestAsk > 0) patch.bestAsk = bestAsk;
    if (Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestAsk >= bestBid) {
      patch.spread = bestAsk - bestBid;
    }
    if (Number.isFinite(high24) && high24 > 0) patch.high24 = high24;
    if (Number.isFinite(low24) && low24 > 0) patch.low24 = low24;
    if (Number.isFinite(open24) && open24 > 0) patch.open24 = open24;
    if (Number.isFinite(vol24) && vol24 >= 0) patch.vol24 = vol24;
  }

  _isSettledOk(result) {
    return result?.status === 'fulfilled' && result.value?.ok;
  }

  _shouldUseRestSource() {
    if (this.manualMode === 'rest') return true;
    if (this.ws?.readyState !== WebSocket.OPEN) return true;
    return this.lastMsgTs > 0 && (Date.now() - this.lastMsgTs > STALE_MS);
  }

  async _applyRestTickerSnapshot(result) {
    if (!this._isSettledOk(result)) return;

    const ticker = await result.value.json();
    const useRestSource = this._shouldUseRestSource();
    const patch = this._buildMarketPatch({
      price: Number.parseFloat(ticker.price),
      bestBid: Number.parseFloat(ticker.bid),
      bestAsk: Number.parseFloat(ticker.ask),
      vol24: Number.parseFloat(ticker.volume),
      wsLatency: 0,
      wsConnected: useRestSource ? false : undefined,
      lastMsgTs: Date.now(),
      wsSource: useRestSource ? 'rest' : undefined,
    });
    marketStore.setState(patch);

    if (useRestSource) this._setSource('rest');
  }

  async _applyRestBookSnapshot(result) {
    if (!this._isSettledOk(result)) return;

    const book = await result.value.json();
    if (Array.isArray(book.bids) && Array.isArray(book.asks)) {
      marketStore.snapshotOrderbook(book.bids, book.asks);
    }
  }

  async _applyRestTradesSnapshot(result) {
    if (!this._isSettledOk(result)) return;

    const trades = await result.value.json();
    if (Array.isArray(trades)) this._ingestRestTrades(trades);
  }

  _handleCaughtError(context, error) {
    console.debug(`[CoinbaseWS] ${context}:`, error?.message || error);
  }

  _ingestRestTrades(trades) {
    const ordered = [...trades].reverse();
    ordered.forEach((trade) => {
      const tradeId = Number.parseInt(trade.trade_id, 10);
      if (Number.isFinite(tradeId) && this._lastTradeId && tradeId <= this._lastTradeId) return;
      const price = Number.parseFloat(trade.price);
      const size = Number.parseFloat(trade.size);
      if (!Number.isFinite(price) || price <= 0) return;
      if (!Number.isFinite(size) || size <= 0) return;
      marketStore.addTrade({
        price,
        size,
        side: trade.side,
        time: trade.time,
        ts: Date.now(),
      });
      if (Number.isFinite(tradeId)) this._lastTradeId = tradeId;
    });
  }

  _enterRestOnlyMode() {
    clearInterval(this.pingInterval);
    clearInterval(this.staleTimer);
    clearInterval(this.restPollTimer);
    this._setStatus('rest');
    marketStore.setState({
      wsConnected: false,
      wsSource: 'rest',
      manualFallbackEnabled: false,
      manualRestEnabled: true,
    });
    this._pollRestSnapshot();
    this.restPollTimer = setInterval(() => {
      if (this.manualMode !== 'rest') return;
      this._pollRestSnapshot();
    }, 4000);
  }
}
