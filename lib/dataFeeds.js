// ╔══════════════════════════════════════════════════════════════════╗
// ║  QUANT//DESK — DATA FEEDS                                       ║
// ║  Multi-timeframe candles, funding rate, Kalshi market data     ║
// ╚══════════════════════════════════════════════════════════════════╝

const CB = 'https://api.exchange.coinbase.com';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 BTC-Terminal/1.0' };

// ── Candles ─────────────────────────────────────────────────────────

async function fetchCandles(granularity, limit=100) {
  const r = await fetch(`${CB}/products/BTC-USD/candles?granularity=${granularity}&limit=${limit}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`Candles ${granularity} failed: ${r.status}`);
  const d = await r.json();
  return d.reverse().map(c => ({ time:c[0], low:c[1], high:c[2], open:c[3], close:c[4], volume:c[5] })).filter(c=>c.close>0);
}

export async function fetchAllTimeframes() {
  const [c1m, c5m, c15m, c1h] = await Promise.allSettled([
    fetchCandles(60,  90),
    fetchCandles(300, 60),
    fetchCandles(900, 200),
    fetchCandles(3600,48),
  ]);
  return {
    candles1m:  c1m.status  === 'fulfilled' ? c1m.value  : [],
    candles5m:  c5m.status  === 'fulfilled' ? c5m.value  : [],
    candles15m: c15m.status === 'fulfilled' ? c15m.value : [],
    candles1h:  c1h.status  === 'fulfilled' ? c1h.value  : [],
  };
}

// ── Funding Rate ─────────────────────────────────────────────────────

export async function fetchFundingRate() {
  try {
    const r = await fetch(`${COINGECKO}/derivatives?include_tickers=unexpired`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const top = ['Binance (Futures)', 'OKX (Futures)', 'Bybit'];
    const btcPerps = d.filter(x =>
      x.symbol?.includes('BTC') && x.symbol?.includes('USDT') &&
      top.includes(x.market) && x.funding_rate != null
    );
    if (!btcPerps.length) return null;
    const avg = btcPerps.reduce((a,x)=>a+parseFloat(x.funding_rate),0) / btcPerps.length;
    return {
      rate: avg,
      signal: avg > 0.0003  ? 'LONGS_OVEREXTENDED'
             : avg < -0.0001 ? 'SHORTS_OVEREXTENDED'
             : 'NEUTRAL',
      exchanges: btcPerps.map(x=>({ market:x.market, rate:parseFloat(x.funding_rate) })),
    };
  } catch(e) {
    console.warn('Funding fetch failed:', e.message);
    return null;
  }
}

// ── Kalshi Market Price ───────────────────────────────────────────────
// Fetched via /api/kalshi (Vercel serverless proxy — requires Kalshi token in env)

export async function fetchKalshiPrice(strikePrice) {
  try {
    const r = await fetch('/api/kalshi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strikePrice }),
    });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch(e) {
    return null;  // Falls back to synthetic model if unavailable
  }
}

// ── 15-min window timing ─────────────────────────────────────────────

export function getKalshiWindow() {
  const now     = Date.now();
  const windowMs= 15 * 60 * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const windowClose = windowStart + windowMs;
  const secsLeft    = Math.round((windowClose - now) / 1000);
  const pctElapsed  = (now - windowStart) / windowMs;

  return {
    windowStart,
    windowClose,
    secsLeft,
    minsLeft:   Math.floor(secsLeft / 60),
    secsFrac:   secsLeft % 60,
    pctElapsed,
    // Best entry window: 10-13 min elapsed (signal confirmed, time value fair)
    isOptimalEntry: pctElapsed > 0.65 && pctElapsed < 0.90,
    isEarlyWindow:  pctElapsed < 0.33,
    isFinalMinute:  secsLeft < 60,
    closeTime:      new Date(windowClose).toLocaleTimeString(),
  };
}
