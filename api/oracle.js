// Multi-source BTC price oracle
// Fetches Binance.us + Kraken + Bybit in parallel, computes consensus price

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=4');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sources = await Promise.allSettled([
    fetchBinanceUs(),
    fetchKraken(),
    fetchBybit(),
  ]);

  const results = sources.map((s, i) => {
    const name = ['BINANCE_US', 'KRAKEN', 'BYBIT'][i];
    if (s.status === 'fulfilled') return { exchange: name, ...s.value, ok: true };
    return { exchange: name, price: null, mid: null, ok: false, err: s.reason?.message };
  });

  const validMids = results.filter(r => r.ok && r.mid > 0).map(r => r.mid);

  if (!validMids.length) {
    return res.status(503).json({ error: 'All price sources failed', sources: results });
  }

  // Median mid-price (resistant to outliers)
  const sorted = [...validMids].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  // Z-score outlier flagging — flag sources >0.3% from median
  const tagged = results.map(r => ({
    ...r,
    deviation: r.mid ? Math.abs(r.mid - median) / median * 100 : null,
    outlier: r.mid ? Math.abs(r.mid - median) / median > 0.003 : false,
  }));

  // Volume-weighted composite (use equal weights since all spot; flag outliers)
  const cleanSources = tagged.filter(r => r.ok && !r.outlier);
  const composite = cleanSources.length > 0
    ? cleanSources.reduce((a, r) => a + r.mid, 0) / cleanSources.length
    : median;

  // Confidence: 0–100 based on how many sources are in agreement
  const maxDev = Math.max(...tagged.filter(r => r.ok).map(r => r.deviation || 0), 0);
  const confidence = Math.round(Math.max(0, Math.min(100, 100 - maxDev * 100)));

  return res.status(200).json({
    price: +composite.toFixed(2),
    median: +median.toFixed(2),
    deviation: +(Math.max(...tagged.filter(r => r.ok).map(r => r.deviation || 0), 0)).toFixed(4),
    confidence,
    sources: tagged,
    ts: Date.now(),
  });
}

async function fetchBinanceUs() {
  const r = await fetch('https://api.binance.us/api/v3/bookTicker?symbol=BTCUSDT', {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`Binance.us HTTP ${r.status}`);
  const d = await r.json();
  const bid = parseFloat(d.bidPrice), ask = parseFloat(d.askPrice);
  return { price: (bid + ask) / 2, mid: (bid + ask) / 2, bid, ask };
}

async function fetchKraken() {
  const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  const d = await r.json();
  if (d.error?.length) throw new Error(d.error[0]);
  const ticker = d.result.XXBTZUSD;
  const bid = parseFloat(ticker.b[0]), ask = parseFloat(ticker.a[0]);
  return { price: (bid + ask) / 2, mid: (bid + ask) / 2, bid, ask };
}

async function fetchBybit() {
  const r = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT', {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`Bybit HTTP ${r.status}`);
  const d = await r.json();
  if (d.retCode !== 0) throw new Error(d.retMsg);
  const t = d.result?.list?.[0];
  if (!t) throw new Error('No Bybit ticker data');
  const bid = parseFloat(t.bid1Price), ask = parseFloat(t.ask1Price);
  return { price: (bid + ask) / 2, mid: (bid + ask) / 2, bid, ask };
}
