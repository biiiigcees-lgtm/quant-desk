const COINBASE_TICKER_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';
const COINBASE_BOOK_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/book?level=2';
const CRYPTOCOMPARE_REFERENCE_URL = 'https://min-api.cryptocompare.com/data/v2/histominute?fsym=BTC&tsym=USD&limit=1';

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
}

export function computeOracleComposite(results) {
  const validMids = results.filter((result) => result.ok && result.mid > 0).map((result) => result.mid);
  if (!validMids.length) {
    throw new Error('All price sources failed');
  }

  const med = median(validMids);
  const tagged = results.map((result) => ({
    ...result,
    deviation: result.mid ? Math.abs(result.mid - med) / med * 100 : null,
    outlier: result.mid ? Math.abs(result.mid - med) / med > 0.003 : false,
  }));
  const clean = tagged.filter((result) => result.ok && !result.outlier);
  const composite = clean.length > 0
    ? clean.reduce((sum, result) => sum + result.mid, 0) / clean.length
    : med;
  const maxDev = Math.max(...tagged.filter((result) => result.ok).map((result) => result.deviation || 0), 0);
  const confidence = Math.round(Math.max(0, Math.min(100, 100 - maxDev * 100)));

  return {
    price: Number(composite.toFixed(2)),
    median: Number(med.toFixed(2)),
    deviation: Number(maxDev.toFixed(4)),
    confidence,
    sources: tagged,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=4');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sources = await Promise.allSettled([
    fetchCoinbaseTicker(),
    fetchCoinbaseBook(),
    fetchCryptoCompareReference(),
  ]);

  const results = sources.map((source, index) => {
    const name = ['coinbase-ticker', 'coinbase-book', 'cryptocompare-ref'][index];
    if (source.status === 'fulfilled') return { exchange: name, ...source.value, ok: true };
    return { exchange: name, price: null, mid: null, ok: false, err: source.reason?.message };
  });

  try {
    const payload = computeOracleComposite(results);
    return res.status(200).json({
      ...payload,
      ts: Date.now(),
    });
  } catch (error) {
    return res.status(503).json({ error: error.message, sources: results });
  }
}

async function fetchCoinbaseTicker() {
  const r = await fetch(COINBASE_TICKER_URL, {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`Coinbase ticker HTTP ${r.status}`);
  const d = await r.json();
  const bid = Number.parseFloat(d.bid);
  const ask = Number.parseFloat(d.ask);
  const price = Number.parseFloat(d.price);
  const mid = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : price;
  return { price: mid, mid, bid, ask };
}

async function fetchCoinbaseBook() {
  const r = await fetch(COINBASE_BOOK_URL, {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`Coinbase book HTTP ${r.status}`);
  const d = await r.json();
  const bestBid = Number.parseFloat(d?.bids?.[0]?.[0]);
  const bestAsk = Number.parseFloat(d?.asks?.[0]?.[0]);
  const mid = Number.isFinite(bestBid) && Number.isFinite(bestAsk) ? (bestBid + bestAsk) / 2 : NaN;
  return { price: mid, mid, bid: bestBid, ask: bestAsk };
}

async function fetchCryptoCompareReference() {
  const r = await fetch(CRYPTOCOMPARE_REFERENCE_URL, {
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`CryptoCompare HTTP ${r.status}`);
  const d = await r.json();
  const candle = d?.Data?.Data?.at?.(-1);
  const close = Number.parseFloat(candle?.close);
  if (!Number.isFinite(close) || close <= 0) throw new Error('CryptoCompare returned no reference price');
  return { price: close, mid: close, bid: close, ask: close };
}
