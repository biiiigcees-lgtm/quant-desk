const KALSHI_OPEN_MARKETS_URL = 'https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC&status=open&limit=200';
const KALSHI_HEADERS = { Accept: 'application/json' };

function parsePrice(value) {
  if (value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDollarPrice(value) {
  if (!Number.isFinite(value)) return null;
  if (value > 1.5) return value / 100;
  return value;
}

function inferYesFromNoQuotes(yesBid, yesAsk, noBidRaw, noAskRaw) {
  let inferredBid = yesBid;
  let inferredAsk = yesAsk;

  if (!Number.isFinite(inferredBid) && Number.isFinite(noAskRaw)) {
    inferredBid = Math.max(0, 1 - noAskRaw);
  }
  if (!Number.isFinite(inferredAsk) && Number.isFinite(noBidRaw)) {
    inferredAsk = Math.max(0, 1 - noBidRaw);
  }

  return { yesBid: inferredBid, yesAsk: inferredAsk };
}

function computeMidPrice(yesBid, yesAsk) {
  if (Number.isFinite(yesBid) && Number.isFinite(yesAsk)) return (yesBid + yesAsk) / 2;
  if (Number.isFinite(yesBid)) return yesBid;
  if (Number.isFinite(yesAsk)) return yesAsk;
  return null;
}

// Processes a Kalshi market into a normalized above-threshold quote.
// Detects B (below) vs T (above) market type by ticker suffix and inverts B markets.
function processMarket(m) {
  const yesBidRaw = parsePrice(m.yes_bid_dollars ?? m.yes_bid);
  const yesAskRaw = parsePrice(m.yes_ask_dollars ?? m.yes_ask);
  const noBidRaw  = parsePrice(m.no_bid_dollars  ?? m.no_bid);
  const noAskRaw  = parsePrice(m.no_ask_dollars  ?? m.no_ask);

  const inferred = inferYesFromNoQuotes(yesBidRaw, yesAskRaw, noBidRaw, noAskRaw);
  const yesBid = normalizeDollarPrice(inferred.yesBid);
  const yesAsk = normalizeDollarPrice(inferred.yesAsk);
  const mid = computeMidPrice(yesBid, yesAsk);

  if (!Number.isFinite(mid) || mid <= 0 || mid >= 1) return null;

  // T = threshold-above (YES = BTC above price) → use as-is
  // B = threshold-below (YES = BTC below price) → invert to get P(above)
  const isBelow = m.ticker && /-B\d/.test(m.ticker);
  let aboveMid = isBelow ? 1 - mid : mid;
  let aboveBid = isBelow ? (Number.isFinite(yesAsk) ? Math.max(0, 1 - yesAsk) : null) : yesBid;
  let aboveAsk = isBelow ? (Number.isFinite(yesBid) ? Math.max(0, 1 - yesBid) : null) : yesAsk;

  if (Number.isFinite(aboveMid)) aboveMid = Math.max(0.001, Math.min(0.999, aboveMid));
  if (Number.isFinite(aboveBid)) aboveBid = Math.max(0, Math.min(1, aboveBid));
  if (Number.isFinite(aboveAsk)) aboveAsk = Math.max(0, Math.min(1, aboveAsk));

  return { yes_bid: aboveBid, yes_ask: aboveAsk, mid: aboveMid, ticker: m.ticker, title: m.title, close_time: m.close_time ?? null, isBelow };
}

// Kalshi markets proxy (server-side to avoid browser CORS)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const response = await fetch(KALSHI_OPEN_MARKETS_URL, {
      headers: KALSHI_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Kalshi HTTP ${response.status}`);

    const payload = await response.json();
    const mkts = payload?.markets || [];

    // Prefer T (threshold-above) markets — they map 1:1 to our P(above) model.
    // Fall back to all markets (with B-inversion) if no T markets have mid near 0.5.
    const tMkts = mkts.filter((m) => m.ticker && /-T\d/.test(m.ticker));
    const searchSet = tMkts.length > 0 ? tMkts : mkts;

    let best = null;
    let bestDist = Infinity;

    for (const m of searchSet) {
      const p = processMarket(m);
      if (!p) continue;
      const dist = Math.abs(p.mid - 0.5);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }

    // If all T markets are far OTM, widen search to all markets
    if (bestDist > 0.4 && tMkts.length > 0) {
      for (const m of mkts) {
        const p = processMarket(m);
        if (!p) continue;
        const dist = Math.abs(p.mid - 0.5);
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
    }

    if (!best) return res.status(503).json({ error: 'No Kalshi market quotes', ts: Date.now() });

    // Reject if no market is close to ATM (all >95% or <5% probability)
    if (bestDist > 0.45) return res.status(503).json({ error: 'No ATM Kalshi market found', ts: Date.now() });

    return res.status(200).json({ ...best, ts: Date.now() });
  } catch (e) {
    return res.status(503).json({ error: e.message, ts: Date.now() });
  }
}
