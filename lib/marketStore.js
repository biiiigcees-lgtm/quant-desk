// ╔══════════════════════════════════════════════════════╗
// ║  QUANT//DESK — MarketStore                          ║
// ║  Single source of truth. Reactive. AI-ready.        ║
// ╚══════════════════════════════════════════════════════╝

export class MarketStore {
  constructor() {
    this._state = {
      // Price
      price: null, bestBid: null, bestAsk: null, spread: null,
      open24: null, high24: null, low24: null, vol24: null,

      // Orderbook (sorted arrays)
      orderbook: { bids: [], asks: [] },
      imbalance: 0,         // bid vol / ask vol ratio
      liquidityWalls: [],   // detected size clusters

      // Trade stream
      lastTrade: null,
      trades: [],           // last 100 trades

      // Orderflow metrics
      cvd: 0,               // cumulative volume delta
      tradeDeltaBuy: 0,     // rolling buy vol (last 50)
      tradeDeltaSell: 0,    // rolling sell vol (last 50)
      aggression: 0,        // (buy-sell)/(buy+sell)
      absorption: null,     // detected absorption events
      spoofLevels: [],      // suspected spoof/iceberg levels

      // Candles
      candles: [],

      // Derived intelligence
      regime: 'NEUTRAL',
      ema9: 0, ema21: 0, emaSpread: 0, emaCross: 'NONE',
      rsi: 50, macd: 0, macdSig: 0,
      bb: { upper: 0, mid: 0, lower: 0 },
      vwap: 0, atr: 0, stoch: 50, momentum: 0,
      trajectorySlope: 0, trendStrength: 0,
      pAbove: 0.5, pBelow: 0.5,
      verdict: 'ABOVE', confidence: 70,
      kalshiAbove: 50, kalshiBelow: 50,
      kellyFull: 0, kellyEdge: 0,
      betData: null,
      anomalies: [], sweeps: [], fvgs: [],
      liquidationZones: [],

      // WS meta
      wsConnected: false, wsLatency: 0, reconnectCount: 0, lastMsgTs: 0,
      wsSource: 'coinbase',
      manualFallbackEnabled: false,
      manualRestEnabled: false,
      updatedAt: null,

      // Oracle (multi-source price)
      oraclePrice: null, oracleSources: [], oracleDeviation: 0, oracleConf: 0,

      // Derivatives (Bybit futures)
      fundingRate: 0, fundingRatePct: 0, annualizedPct: 0,
      fundingCountdown: '--:--', nextFundingTime: 0,
      openInterest: 0, oiDelta: 0, oiDeltaPct: 0, oiPriceDiv: 'NEUTRAL',
      markPrice: 0, indexPrice: 0,

      // Flow toxicity
      flowToxicity: 0,

      // Regime v2
      regimeConf: 50, realizedVol: 0, adxVal: 0,

      // Ensemble scouts
      scoutScores: { trend: 0, meanRev: 0, volatility: 0, flow: 0 },

      // 4-Scenario probabilities
      pBullDrift: 0.5, pRangeBound: 0.2, pVolExpansion: 0.2, pTailRisk: 0.1,

      // Kalman filter
      kalmanPrice: null, kalmanVelocity: 0, kalmanUncertainty: 0,

      // Trust layer
      signalLog: [], brierScore: null, signalAccuracy: null,
    };

    this._listeners = new Set();
    this._bidsMap = new Map();  // price → size (live level2)
    this._asksMap = new Map();
    this._orderbookRebuildTimer = null;
    this._lastOrderbookRebuildTs = 0;
    this._orderbookThrottleMs = 90;
  }

  // ── Core reactive API ──────────────────────────────

  get state() { return this._state; }

  setState(patch) {
    Object.assign(this._state, patch, { updatedAt: Date.now() });
    this._notify();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    try {
      fn(this._state);
    } catch(e) {
      console.debug('listener immediate call failed:', e?.message || e);
    } // immediate call with current state
    return () => this._listeners.delete(fn); // returns unsubscribe
  }

  _notify() {
    for (const fn of this._listeners) {
      try {
        fn(this._state);
      } catch(e) {
        // Isolate listener errors so one bad subscriber cannot break stream updates.
        console.debug('listener notify failed:', e?.message || e);
      }
    }
  }

  // ── Orderbook ─────────────────────────────────────

  snapshotOrderbook(bids, asks) {
    this._bidsMap.clear();
    this._asksMap.clear();
    bids.forEach(([p, s]) => { const ps = +p, ss = +s; if (ss > 0) this._bidsMap.set(ps, ss); });
    asks.forEach(([p, s]) => { const ps = +p, ss = +s; if (ss > 0) this._asksMap.set(ps, ss); });
    this._scheduleOrderbookRebuild(true);
  }

  updateOrderbook(changes) {
    changes.forEach(([side, p, s]) => {
      const ps = +p, ss = +s;
      const map = side === 'buy' ? this._bidsMap : this._asksMap;
      ss === 0 ? map.delete(ps) : map.set(ps, ss);
    });
    this._scheduleOrderbookRebuild(false);
  }

  _scheduleOrderbookRebuild(forceImmediate = false) {
    const isBrowserRuntime = globalThis.window !== undefined && typeof globalThis.window.setTimeout === 'function';
    if (!isBrowserRuntime || forceImmediate) {
      this._rebuildOrderbook();
      return;
    }

    const now = Date.now();
    const elapsed = now - this._lastOrderbookRebuildTs;
    if (elapsed >= this._orderbookThrottleMs && !this._orderbookRebuildTimer) {
      this._rebuildOrderbook();
      return;
    }

    if (this._orderbookRebuildTimer) return;
    const waitMs = Math.max(0, this._orderbookThrottleMs - elapsed);
    this._orderbookRebuildTimer = setTimeout(() => {
      this._orderbookRebuildTimer = null;
      this._rebuildOrderbook();
    }, waitMs);
  }

  _rebuildOrderbook() {
    if (this._orderbookRebuildTimer) {
      clearTimeout(this._orderbookRebuildTimer);
      this._orderbookRebuildTimer = null;
    }
    this._lastOrderbookRebuildTs = Date.now();

    const bids = [...this._bidsMap.entries()].sort((a,b) => b[0]-a[0]).slice(0, 25);
    const asks = [...this._asksMap.entries()].sort((a,b) => a[0]-b[0]).slice(0, 25);

    const bidVol = bids.slice(0,10).reduce((a,[,s]) => a+s, 0);
    const askVol = asks.slice(0,10).reduce((a,[,s]) => a+s, 0);
    const imbalance = (bidVol - askVol) / (bidVol + askVol + 1e-9);

    // Liquidity wall detection — levels with 3x average size
    const allSizes = [...bids.slice(0,15), ...asks.slice(0,15)].map(([,s]) => s);
    const avgSize = allSizes.reduce((a,b) => a+b, 0) / (allSizes.length || 1);
    const threshold = avgSize * 2.8;
    const liquidityWalls = [
      ...bids.filter(([,s]) => s >= threshold).map(([p,s]) => ({ side:'bid', price:p, size:s })),
      ...asks.filter(([,s]) => s >= threshold).map(([p,s]) => ({ side:'ask', price:p, size:s })),
    ].sort((a,b) => b.size - a.size).slice(0, 6);

    this._state.orderbook = { bids, asks };
    this._state.imbalance = imbalance;
    this._state.liquidityWalls = liquidityWalls;

    // Spoof detection — large wall that appears then disappears
    this._detectSpoof(bids, asks);
    this._notify();
  }

  _prevWalls = new Map();
  _detectSpoof(bids, asks) {
    const spoofLevels = [];
    const now = Date.now();
    const combined = [
      ...bids.slice(0,15).map(([p,s]) => ({ price:p, size:s, side:'bid' })),
      ...asks.slice(0,15).map(([p,s]) => ({ price:p, size:s, side:'ask' })),
    ];
    combined.forEach(({ price, size, side }) => {
      const key = `${side}:${price}`;
      const prev = this._prevWalls.get(key);
      if (prev) {
        // Wall appeared large, then dropped significantly in <5s → spoof signal
        if (prev.size > size * 3 && now - prev.ts < 5000 && prev.size > 0.5) {
          spoofLevels.push({ price, side, prevSize: prev.size, curSize: size, ts: now });
        }
      }
      this._prevWalls.set(key, { size, ts: now });
    });
    if (spoofLevels.length) this._state.spoofLevels = spoofLevels.slice(0, 4);

    // Prune stale entries to prevent unbounded Map growth over long sessions
    if (this._prevWalls.size > 500) {
      const cutoff = now - 60000;
      for (const [k, v] of this._prevWalls) {
        if (v.ts < cutoff) this._prevWalls.delete(k);
      }
    }
  }

  // ── Trades ────────────────────────────────────────

  addTrade(trade) {
    this._state.lastTrade = trade;
    this._state.trades = [trade, ...this._state.trades].slice(0, 100);

    // CVD
    this._state.cvd += trade.side === 'buy' ? trade.size : -trade.size;

    // Rolling delta (last 50)
    const last50 = this._state.trades.slice(0, 50);
    const buy  = last50.filter(t => t.side === 'buy').reduce((a,t) => a+t.size, 0);
    const sell = last50.filter(t => t.side === 'sell').reduce((a,t) => a+t.size, 0);
    this._state.tradeDeltaBuy  = buy;
    this._state.tradeDeltaSell = sell;
    this._state.aggression     = (buy - sell) / (buy + sell + 1e-9);

    // Absorption detection — large sell hitting strong bid support (or vice versa)
    this._detectAbsorption(trade);

    this.computeFlowToxicity();
    this._notify();
  }

  _absorbBuffer = [];
  _detectAbsorption(trade) {
    this._absorbBuffer.push(trade);
    if (this._absorbBuffer.length > 20) this._absorbBuffer.shift();

    const recentSell = this._absorbBuffer.filter(t => t.side === 'sell').reduce((a,t) => a+t.size, 0);
    const recentBuy  = this._absorbBuffer.filter(t => t.side === 'buy').reduce((a,t) => a+t.size, 0);
    const price      = this._state.price;
    const imbalance  = this._state.imbalance;

    // Sell absorption: heavy sell flow but price NOT dropping + bid-heavy OB
    if (recentSell > recentBuy * 2.5 && imbalance > 0.15 && price !== null) {
      const prevPrice = this._absorbBuffer[0]?.price;
      const priceMove = prevPrice ? Math.abs(price - prevPrice) / price : 1;
      if (priceMove < 0.001) {  // <0.1% move despite heavy selling
        this._state.absorption = {
          type: 'SELL_ABSORBED',
          price,
          sellFlow: recentSell.toFixed(4),
          ts: Date.now(),
        };
        return;
      }
    }
    // Buy absorption: heavy buy flow absorbed by ask supply
    if (recentBuy > recentSell * 2.5 && imbalance < -0.15 && price !== null) {
      const prevPrice = this._absorbBuffer[0]?.price;
      const priceMove = prevPrice ? Math.abs(price - prevPrice) / price : 1;
      if (priceMove < 0.001) {
        this._state.absorption = {
          type: 'BUY_ABSORBED',
          price,
          buyFlow: recentBuy.toFixed(4),
          ts: Date.now(),
        };
        return;
      }
    }
    // Clear stale absorption after 30s
    if (this._state.absorption && Date.now() - this._state.absorption.ts > 30000) {
      this._state.absorption = null;
    }
  }

  // ── Liquidation zones ─────────────────────────────

  computeLiquidationZones(price) {
    if (!price) return;
    // Synthetic leverage cluster model
    // Based on known liquidation cascade distances from current price
    const zones = [
      { price: price * 1.012, strength: 0.9,  side: 'long',  leverage: '10x' },
      { price: price * 0.988, strength: 0.85, side: 'short', leverage: '10x' },
      { price: price * 1.025, strength: 0.65, side: 'long',  leverage: '5x'  },
      { price: price * 0.975, strength: 0.7,  side: 'short', leverage: '5x'  },
      { price: price * 1.05,  strength: 0.4,  side: 'long',  leverage: '3x'  },
      { price: price * 0.95,  strength: 0.45, side: 'short', leverage: '3x'  },
      { price: price * 1.1,   strength: 0.25, side: 'long',  leverage: '2x'  },
      { price: price * 0.9,   strength: 0.3,  side: 'short', leverage: '2x'  },
    ];
    this._state.liquidationZones = zones;
  }
  // ── Flow toxicity ─────────────────────────────────

  computeFlowToxicity() {
    const s = this._state;
    const buy  = s.tradeDeltaBuy  || 0;
    const sell = s.tradeDeltaSell || 0;
    const total = buy + sell;
    let toxicity = total > 0 ? Math.abs(buy - sell) / total * 100 : 0;
    // Boost on active microstructure events
    if (s.absorption) toxicity = Math.min(100, toxicity * 1.25);
    if (s.spoofLevels?.length > 0) toxicity = Math.min(100, toxicity * 1.15);
    this._state.flowToxicity = Math.round(toxicity);
  }
}

export const marketStore = new MarketStore();
