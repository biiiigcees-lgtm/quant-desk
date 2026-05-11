// ╔══════════════════════════════════════════════════════╗
// ║  QUANT//DESK — CoinbaseWS                           ║
// ║  WebSocket engine. Auto-reconnects. Sub-second feed.║
// ╚══════════════════════════════════════════════════════╝

import { marketStore } from './marketStore.js';

const WS_URL = 'wss://ws-feed.exchange.coinbase.com';
const FALLBACK_WS_URL = 'wss://ws.kraken.com';
const FALLBACK_PAIR = 'XBT/USD';
const REST_TICKER_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';
const REST_BOOK_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/book?level=2';
const REST_TRADES_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=50';
const STALE_MS = 20000;

export class CoinbaseWS {
  ws = null;
  fallbackWs = null;
  fallbackActive = false;
  manualMode = 'auto';
  manualFallback = false;
  forceRest = false;
  reconnectAttempts = 0;
  pingInterval = null;
  connectTs = 0;
  _statusListeners = new Set();
  lastMsgTs = 0;
  fallbackLastMsgTs = 0;
  staleTimer = null;
  fallbackTimer = null;
  restPollTimer = null;
  _staleTriggered = false;
  _restPolling = false;
  _lastTradeId = null;
  reconnectTimer = null;

  // ── Public API ───────────────────────────────────────

  connect() {
    if (this.manualMode === 'rest') {
      this._clearReconnectTimer();
      this._enterRestOnlyMode();
      return;
    }
    if (this.manualMode === 'fallback') {
      this._clearReconnectTimer();
      this._startFallbackWS();
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this._setStatus('connecting');

    try {
      this.ws = new WebSocket(WS_URL);
    } catch(e) {
      this._handleCaughtError('connect:new-websocket', e);
      this._setStatus('error');
      this._scheduleReconnect();
      return;
    }

    this.connectTs = Date.now();

    this.ws.onopen = () => {
      if (this.manualMode !== 'auto') return;
      this._clearReconnectTimer();
      this.reconnectAttempts = 0;
      this._setStatus('connected');
      this._stopFallbackWS();
      this.lastMsgTs = Date.now();
      marketStore.setState({
        wsConnected: true,
        reconnectCount: 0,
        lastMsgTs: this.lastMsgTs,
        wsSource: 'coinbase',
      });

      this.ws.send(JSON.stringify({
        type: 'subscribe',
        product_ids: ['BTC-USD'],
        channels: ['ticker', 'level2_50', 'matches', 'heartbeat'],
      }));

      // Heartbeat every 20s to prevent silent disconnect
      clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'heartbeat', on: true, product_ids: ['BTC-USD'] }));
        }
      }, 20000);

      clearInterval(this.staleTimer);
      this.staleTimer = setInterval(() => {
        if (this.manualMode !== 'auto') return;
        const age = Date.now() - this.lastMsgTs;
        if (age > STALE_MS && !this._staleTriggered) {
          this._staleTriggered = true;
          this._setStatus('error');
          marketStore.setState({ wsConnected: false });
          this._pollRestSnapshot();
          this._startFallbackWS();
          try { this.ws?.close(); } catch(e) { this._handleCaughtError('stale-timer:close-ws', e); }
        } else if (age <= STALE_MS) {
          this._staleTriggered = false;
        }
      }, 5000);

      clearInterval(this.restPollTimer);
      this.restPollTimer = setInterval(() => {
        if (this.manualMode !== 'auto') return;
        const age = Date.now() - this.lastMsgTs;
        if (age > STALE_MS) this._pollRestSnapshot();
      }, 10000);
    };

    this.ws.onmessage = (evt) => {
      try {
        this.handleMessage(JSON.parse(evt.data));
      } catch(e) {
        this._handleCaughtError('ws:onmessage:parse-or-handle', e);
      }
    };

    this.ws.onerror = () => {
      this._setStatus('error');
      this.ws?.close();
    };

    this.ws.onclose = () => {
      marketStore.setState({ wsConnected: false });
      clearInterval(this.pingInterval);
      clearInterval(this.staleTimer);
      if (this.manualMode === 'rest') {
        this._enterRestOnlyMode();
        return;
      }
      if (this.manualMode === 'fallback') {
        this._startFallbackWS();
        return;
      }
      clearInterval(this.restPollTimer);
      this._setStatus('error');
      if (!this.fallbackActive) this._startFallbackWS();
      this._scheduleReconnect();
    };
  }

  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  setManualFallback(enable) {
    this.setManualMode(enable ? 'fallback' : 'auto');
  }

  setForceRest(enable) {
    this.setManualMode(enable ? 'rest' : 'auto');
  }

  setManualMode(mode) {
    const next = ['auto', 'fallback', 'rest'].includes(mode) ? mode : 'auto';
    if (next === this.manualMode && this.ws?.readyState === WebSocket.OPEN) return;

    this.manualMode = next;
    this.manualFallback = next === 'fallback';
    this.forceRest = next === 'rest';
    marketStore.setState({
      manualFallbackEnabled: this.manualFallback,
      manualRestEnabled: this.forceRest,
    });

    if (next === 'fallback') {
      this._clearReconnectTimer();
      clearInterval(this.restPollTimer);
      this._startFallbackWS();
      try { this.ws?.close(); } catch(e) { this._handleCaughtError('setManualMode:fallback:close-ws', e); }
      return;
    }

    if (next === 'rest') {
      this._clearReconnectTimer();
      this._stopFallbackWS();
      try { this.ws?.close(); } catch(e) { this._handleCaughtError('setManualMode:rest:close-ws', e); }
      this._enterRestOnlyMode();
      return;
    }

    clearInterval(this.restPollTimer);
    this._stopFallbackWS();
    if (this.ws?.readyState !== WebSocket.OPEN) this.connect();
  }

  // ── Message routing ───────────────────────────────────

  handleMessage(d) {
    this.lastMsgTs = Date.now();
    marketStore.setState({ lastMsgTs: this.lastMsgTs });
    if (!this.fallbackActive) this._setSource('coinbase');
    switch (d.type) {
      case 'ticker':    this._onTicker(d);   break;
      case 'snapshot':  this._onSnapshot(d); break;
      case 'l2update':  this._onL2Update(d); break;
      case 'match':
      case 'last_match':this._onTrade(d);    break;
    }
  }

  // ── Handlers ─────────────────────────────────────────

  _onTicker(d) {
    const price = Number.parseFloat(d.price);
    if (!Number.isFinite(price) || price <= 0) return;

    const bestBid = Number.parseFloat(d.best_bid);
    const bestAsk = Number.parseFloat(d.best_ask);
    const high24 = Number.parseFloat(d.high_24h);
    const low24 = Number.parseFloat(d.low_24h);
    const open24 = Number.parseFloat(d.open_24h);
    const vol24 = Number.parseFloat(d.volume_24h);

    const latency = d.time ? Math.max(0, Date.now() - new Date(d.time).getTime()) : 0;

    const patch = this._buildMarketPatch({
      price,
      bestBid,
      bestAsk,
      high24,
      low24,
      open24,
      vol24,
      wsLatency: latency,
    });
    marketStore.setState(patch);
  }

  _onSnapshot(d) {
    if (d.bids && d.asks) {
      marketStore.snapshotOrderbook(d.bids, d.asks);
    }
  }

  _onL2Update(d) {
    if (d.changes) {
      marketStore.updateOrderbook(d.changes);
    }
  }

  _onTrade(d) {
    const price = Number.parseFloat(d.price);
    const size = Number.parseFloat(d.size);
    if (!Number.isFinite(price) || price <= 0) return;
    if (!Number.isFinite(size) || size <= 0) return;

    marketStore.addTrade({
      price,
      size,
      side:  d.side,
      time:  d.time,
      ts:    Date.now(),
    });
  }

  // ── Reconnect ─────────────────────────────────────────

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
      try { fn(status); } catch(e) { this._handleCaughtError('status-listener', e); }
    }
  }

  _setSource(source) {
    if (!source) return;
    marketStore.setState({ wsSource: source });
  }

  _startFallbackWS() {
    if (this.fallbackWs && this.fallbackWs.readyState !== WebSocket.CLOSED) return;
    this.fallbackActive = true;
    this._setStatus('connecting');
    this.fallbackWs = new WebSocket(FALLBACK_WS_URL);

    this.fallbackWs.onopen = () => {
      this.fallbackLastMsgTs = Date.now();
      marketStore.setState({
        wsConnected: true,
        lastMsgTs: this.fallbackLastMsgTs,
        wsSource: 'kraken',
      });
      this._setStatus('connected');
      this.fallbackWs.send(JSON.stringify({
        event: 'subscribe',
        pair: [FALLBACK_PAIR],
        subscription: { name: 'ticker' },
      }));
      this.fallbackWs.send(JSON.stringify({
        event: 'subscribe',
        pair: [FALLBACK_PAIR],
        subscription: { name: 'trade' },
      }));

      clearInterval(this.fallbackTimer);
      this.fallbackTimer = setInterval(() => {
        const age = Date.now() - this.fallbackLastMsgTs;
        if (age > STALE_MS) {
          try { this.fallbackWs?.close(); } catch(e) { this._handleCaughtError('fallback-timer:close', e); }
        }
      }, 5000);
    };

    this.fallbackWs.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch(e) {
        this._handleCaughtError('fallback:onmessage:parse', e);
        return;
      }
      this._handleFallbackMessage(msg);
    };

    this.fallbackWs.onerror = () => {
      try { this.fallbackWs?.close(); } catch(e) { this._handleCaughtError('fallback:onerror:close', e); }
    };

    this.fallbackWs.onclose = () => {
      clearInterval(this.fallbackTimer);
      this.fallbackWs = null;
      if (this.fallbackActive) setTimeout(() => this._startFallbackWS(), 2000);
    };
  }

  _stopFallbackWS() {
    this.fallbackActive = false;
    clearInterval(this.fallbackTimer);
    if (this.fallbackWs) {
      try { this.fallbackWs.close(); } catch(e) { this._handleCaughtError('stopFallback:close', e); }
      this.fallbackWs = null;
    }
  }

  _handleFallbackMessage(msg) {
    const envelope = this._parseFallbackEnvelope(msg);
    if (!envelope) return;

    if (envelope.channel === 'ticker') {
      this._handleFallbackTicker(envelope.payload, envelope.now);
      return;
    }
    if (envelope.channel === 'trade' && Array.isArray(envelope.payload)) {
      this._handleFallbackTrades(envelope.payload, envelope.now);
    }
  }

  // ── REST fallback (poll when WS stalls) ───────────────

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
    } catch(e) {
      this._handleCaughtError('rest-snapshot:poll', e);
    } finally {
      this._restPolling = false;
    }
  }

  _parseFallbackEnvelope(msg) {
    if (msg?.event) return null;
    if (!Array.isArray(msg) || msg.length < 3) return null;
    return {
      channel: msg[2],
      payload: msg[1],
      now: Date.now(),
    };
  }

  _handleFallbackTicker(payload, now) {
    if (!payload) return;
    const price = Number.parseFloat(payload.c?.[0]);
    if (!Number.isFinite(price) || price <= 0) return;

    const patch = this._buildMarketPatch({
      price,
      bestBid: Number.parseFloat(payload.b?.[0]),
      bestAsk: Number.parseFloat(payload.a?.[0]),
      high24: Number.parseFloat(payload.h?.[1] || payload.h?.[0]),
      low24: Number.parseFloat(payload.l?.[1] || payload.l?.[0]),
      open24: Number.parseFloat(payload.o?.[0]),
      vol24: Number.parseFloat(payload.v?.[1] || payload.v?.[0]),
      wsLatency: 0,
      wsConnected: true,
      lastMsgTs: now,
      wsSource: 'kraken',
    });

    marketStore.setState(patch);
    this.fallbackLastMsgTs = now;
  }

  _handleFallbackTrades(payload, now) {
    payload.forEach((trade) => {
      const parsed = this._parseFallbackTrade(trade, now);
      if (!parsed) return;
      marketStore.addTrade(parsed);
    });

    marketStore.setState({ wsConnected: true, lastMsgTs: now, wsSource: 'kraken' });
    this.fallbackLastMsgTs = now;
  }

  _parseFallbackTrade(trade, now) {
    const price = Number.parseFloat(trade[0]);
    const size = Number.parseFloat(trade[1]);
    if (!Number.isFinite(price) || price <= 0) return null;
    if (!Number.isFinite(size) || size <= 0) return null;

    const time = Number.parseFloat(trade[2]);
    const side = trade[3] === 'b' ? 'buy' : 'sell';
    return {
      price,
      size,
      side,
      time: Number.isFinite(time) ? new Date(time * 1000).toISOString() : null,
      ts: now,
    };
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
    return this.manualMode === 'rest' || (!this.fallbackActive && this.ws?.readyState !== WebSocket.OPEN);
  }

  async _applyRestTickerSnapshot(result) {
    if (!this._isSettledOk(result)) return;

    const ticker = await result.value.json();
    const patch = this._buildMarketPatch({
      price: Number.parseFloat(ticker.price),
      bestBid: Number.parseFloat(ticker.bid),
      bestAsk: Number.parseFloat(ticker.ask),
      vol24: Number.parseFloat(ticker.volume),
      wsLatency: 0,
      lastMsgTs: Date.now(),
    });
    marketStore.setState(patch);

    if (this._shouldUseRestSource()) this._setSource('rest');
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
    // REST trades are newest-first; process oldest-first
    const ordered = [...trades].reverse();
    ordered.forEach(t => {
      const tid = Number.parseInt(t.trade_id, 10);
      if (Number.isFinite(tid) && this._lastTradeId && tid <= this._lastTradeId) return;
      const price = Number.parseFloat(t.price);
      const size = Number.parseFloat(t.size);
      if (!Number.isFinite(price) || price <= 0) return;
      if (!Number.isFinite(size) || size <= 0) return;
      marketStore.addTrade({
        price,
        size,
        side:  t.side,
        time:  t.time,
        ts:    Date.now(),
      });
      if (Number.isFinite(tid)) this._lastTradeId = tid;
    });
  }

  _enterRestOnlyMode() {
    clearInterval(this.pingInterval);
    clearInterval(this.staleTimer);
    this._setStatus('rest');
    marketStore.setState({
      wsConnected: false,
      wsSource: 'rest',
    });
    this._pollRestSnapshot();
    clearInterval(this.restPollTimer);
    this.restPollTimer = setInterval(() => {
      if (this.manualMode !== 'rest') return;
      this._pollRestSnapshot();
    }, 4000);
  }
}
