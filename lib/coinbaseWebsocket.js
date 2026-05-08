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
  constructor() {
    this.ws                = null;
    this.fallbackWs         = null;
    this.fallbackActive     = false;
    this.manualMode         = 'auto';
    this.manualFallback     = false;
    this.forceRest          = false;
    this.reconnectAttempts = 0;
    this.pingInterval      = null;
    this.connectTs         = 0;
    this._statusListeners  = new Set();
    this.lastMsgTs          = 0;
    this.fallbackLastMsgTs  = 0;
    this.staleTimer         = null;
    this.fallbackTimer      = null;
    this.restPollTimer      = null;
    this._staleTriggered    = false;
    this._restPolling       = false;
    this._lastTradeId       = null;
  }

  // ── Public API ───────────────────────────────────────

  connect() {
    if (this.manualMode === 'rest') {
      this._enterRestOnlyMode();
      return;
    }
    if (this.manualMode === 'fallback') {
      this._startFallbackWS();
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this._setStatus('connecting');

    try {
      this.ws = new WebSocket(WS_URL);
    } catch(e) {
      this._setStatus('error');
      this._scheduleReconnect();
      return;
    }

    this.connectTs = Date.now();

    this.ws.onopen = () => {
      if (this.manualMode !== 'auto') return;
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
          try { this.ws?.close(); } catch(e) {}
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
      } catch(e) { /* skip malformed */ }
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
      clearInterval(this.restPollTimer);
      this._startFallbackWS();
      try { this.ws?.close(); } catch(e) {}
      return;
    }

    if (next === 'rest') {
      this._stopFallbackWS();
      try { this.ws?.close(); } catch(e) {}
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
    const price = parseFloat(d.price);
    if (!price) return;

    const latency = d.time ? Math.max(0, Date.now() - new Date(d.time).getTime()) : 0;

    marketStore.setState({
      price,
      bestBid:  parseFloat(d.best_bid)   || 0,
      bestAsk:  parseFloat(d.best_ask)   || 0,
      spread:   parseFloat(d.best_ask) - parseFloat(d.best_bid) || 0,
      high24:   parseFloat(d.high_24h)  || 0,
      low24:    parseFloat(d.low_24h)   || 0,
      open24:   parseFloat(d.open_24h)  || 0,
      vol24:    parseFloat(d.volume_24h) || 0,
      wsLatency: latency,
    });
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
    marketStore.addTrade({
      price: parseFloat(d.price),
      size:  parseFloat(d.size),
      side:  d.side,
      time:  d.time,
      ts:    Date.now(),
    });
  }

  // ── Reconnect ─────────────────────────────────────────

  _scheduleReconnect() {
    if (this.manualMode !== 'auto') return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    marketStore.setState({ reconnectCount: this.reconnectAttempts });
    this._setStatus('connecting');
    setTimeout(() => this.connect(), delay);
  }

  _setStatus(status) {
    for (const fn of this._statusListeners) {
      try { fn(status); } catch(e) {}
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
          try { this.fallbackWs?.close(); } catch(e) {}
        }
      }, 5000);
    };

    this.fallbackWs.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch(e) { return; }
      this._handleFallbackMessage(msg);
    };

    this.fallbackWs.onerror = () => {
      try { this.fallbackWs?.close(); } catch(e) {}
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
      try { this.fallbackWs.close(); } catch(e) {}
      this.fallbackWs = null;
    }
  }

  _handleFallbackMessage(msg) {
    if (msg?.event) return;
    if (!Array.isArray(msg) || msg.length < 3) return;
    const channel = msg[2];
    const payload = msg[1];
    const now = Date.now();

    if (channel === 'ticker' && payload) {
      const price = Number.parseFloat(payload.c?.[0]);
      const bestBid = Number.parseFloat(payload.b?.[0]);
      const bestAsk = Number.parseFloat(payload.a?.[0]);
      const high24 = Number.parseFloat(payload.h?.[1] || payload.h?.[0]);
      const low24 = Number.parseFloat(payload.l?.[1] || payload.l?.[0]);
      const open24 = Number.parseFloat(payload.o?.[0]);
      const vol24 = Number.parseFloat(payload.v?.[1] || payload.v?.[0]);

      marketStore.setState({
        price: Number.isFinite(price) ? price : null,
        bestBid: Number.isFinite(bestBid) ? bestBid : null,
        bestAsk: Number.isFinite(bestAsk) ? bestAsk : null,
        high24: Number.isFinite(high24) ? high24 : null,
        low24: Number.isFinite(low24) ? low24 : null,
        open24: Number.isFinite(open24) ? open24 : null,
        vol24: Number.isFinite(vol24) ? vol24 : null,
        wsLatency: 0,
        wsConnected: true,
        lastMsgTs: now,
        wsSource: 'kraken',
      });
      this.fallbackLastMsgTs = now;
    } else if (channel === 'trade' && Array.isArray(payload)) {
      payload.forEach(t => {
        const price = Number.parseFloat(t[0]);
        const size = Number.parseFloat(t[1]);
        const time = Number.parseFloat(t[2]);
        const side = t[3] === 'b' ? 'buy' : 'sell';
        marketStore.addTrade({
          price,
          size,
          side,
          time: Number.isFinite(time) ? new Date(time * 1000).toISOString() : null,
          ts: now,
        });
      });
      marketStore.setState({ wsConnected: true, lastMsgTs: now, wsSource: 'kraken' });
      this.fallbackLastMsgTs = now;
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

      if (tickerRes.status === 'fulfilled' && tickerRes.value.ok) {
        const t = await tickerRes.value.json();
        const price = Number.parseFloat(t.price);
        const bestBid = Number.parseFloat(t.bid);
        const bestAsk = Number.parseFloat(t.ask);
        const vol24 = Number.parseFloat(t.volume);
        marketStore.setState({
          price: Number.isFinite(price) ? price : null,
          bestBid: Number.isFinite(bestBid) ? bestBid : null,
          bestAsk: Number.isFinite(bestAsk) ? bestAsk : null,
          vol24: Number.isFinite(vol24) ? vol24 : null,
          wsLatency: 0,
          lastMsgTs: Date.now(),
        });
        if (this.manualMode === 'rest' || (!this.fallbackActive && this.ws?.readyState !== WebSocket.OPEN)) {
          this._setSource('rest');
        }
      }

      if (bookRes.status === 'fulfilled' && bookRes.value.ok) {
        const b = await bookRes.value.json();
        if (Array.isArray(b.bids) && Array.isArray(b.asks)) {
          marketStore.snapshotOrderbook(b.bids, b.asks);
        }
      }

      if (tradesRes.status === 'fulfilled' && tradesRes.value.ok) {
        const trades = await tradesRes.value.json();
        if (Array.isArray(trades)) this._ingestRestTrades(trades);
      }
    } catch(e) {
      // Silent fallback failure; WS reconnect will retry.
    } finally {
      this._restPolling = false;
    }
  }

  _ingestRestTrades(trades) {
    // REST trades are newest-first; process oldest-first
    const ordered = [...trades].reverse();
    ordered.forEach(t => {
      const tid = Number.parseInt(t.trade_id, 10);
      if (Number.isFinite(tid) && this._lastTradeId && tid <= this._lastTradeId) return;
      marketStore.addTrade({
        price: Number.parseFloat(t.price),
        size:  Number.parseFloat(t.size),
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
