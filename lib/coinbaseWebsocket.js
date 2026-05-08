// ╔══════════════════════════════════════════════════════╗
// ║  QUANT//DESK — CoinbaseWS                           ║
// ║  WebSocket engine. Auto-reconnects. Sub-second feed.║
// ╚══════════════════════════════════════════════════════╝

import { marketStore } from './marketStore.js';

const WS_URL = 'wss://ws-feed.exchange.coinbase.com';

export class CoinbaseWS {
  constructor() {
    this.ws                = null;
    this.reconnectAttempts = 0;
    this.pingInterval      = null;
    this.connectTs         = 0;
    this._statusListeners  = new Set();
  }

  // ── Public API ───────────────────────────────────────

  connect() {
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
      this.reconnectAttempts = 0;
      this._setStatus('connected');
      marketStore.setState({ wsConnected: true, reconnectCount: 0 });

      this.ws.send(JSON.stringify({
        type: 'subscribe',
        product_ids: ['BTC-USD'],
        channels: ['ticker', 'level2_50', 'matches'],
      }));

      // Heartbeat every 20s to prevent silent disconnect
      clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'heartbeat', on: true, product_ids: ['BTC-USD'] }));
        }
      }, 20000);
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
      this._setStatus('error');
      clearInterval(this.pingInterval);
      this._scheduleReconnect();
    };
  }

  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  // ── Message routing ───────────────────────────────────

  handleMessage(d) {
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

    const latency = d.time ? Date.now() - new Date(d.time).getTime() : 0;

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
}
