// Kalshi markets proxy (server-side to avoid browser CORS)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch(
      'https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC&status=open&limit=100',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) throw new Error(`Kalshi HTTP ${r.status}`);
    const d = await r.json();
    const mkts = d?.markets || [];
    const parsePrice = (v) => {
      if (v == null) return null;
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };

    // Pick the market whose mid is closest to 0.5 (at-the-money = most informative)
    let best = null;
    let bestDist = Infinity;

    for (const m of mkts) {
      const yesBidRaw = parsePrice(m.yes_bid_dollars ?? m.yes_bid);
      const yesAskRaw = parsePrice(m.yes_ask_dollars ?? m.yes_ask);
      const noBidRaw = parsePrice(m.no_bid_dollars ?? m.no_bid);
      const noAskRaw = parsePrice(m.no_ask_dollars ?? m.no_ask);

      let yesBid = Number.isFinite(yesBidRaw) ? yesBidRaw : null;
      let yesAsk = Number.isFinite(yesAskRaw) ? yesAskRaw : null;

      // Infer YES prices from NO quotes when YES side is missing.
      if (!Number.isFinite(yesBid) && Number.isFinite(noAskRaw)) yesBid = Math.max(0, 1 - noAskRaw);
      if (!Number.isFinite(yesAsk) && Number.isFinite(noBidRaw)) yesAsk = Math.max(0, 1 - noBidRaw);

      // Normalize cents to dollars if needed.
      if (Number.isFinite(yesBid) && yesBid > 1.5) yesBid /= 100;
      if (Number.isFinite(yesAsk) && yesAsk > 1.5) yesAsk /= 100;

      let mid = null;
      if (Number.isFinite(yesBid) && Number.isFinite(yesAsk)) mid = (yesBid + yesAsk) / 2;
      else if (Number.isFinite(yesBid)) mid = yesBid;
      else if (Number.isFinite(yesAsk)) mid = yesAsk;

      if (mid == null || mid <= 0 || mid >= 1) continue;

      const dist = Math.abs(mid - 0.5);
      if (dist < bestDist) {
        bestDist = dist;
        best = { yes_bid: yesBid, yes_ask: yesAsk, mid, ticker: m.ticker, title: m.title, close_time: m.close_time ?? null };
      }
    }

    if (!best) return res.status(503).json({ error: 'No Kalshi market quotes', ts: Date.now() });

    // If the best market is still very far from ATM (>90%/<10%), data is likely stale or wrong series
    if (bestDist > 0.45) return res.status(503).json({ error: 'No ATM Kalshi market found', ts: Date.now() });

    return res.status(200).json({ ...best, ts: Date.now() });
  } catch (e) {
    return res.status(503).json({ error: e.message, ts: Date.now() });
  }
}
