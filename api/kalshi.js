// Kalshi markets proxy (server-side to avoid browser CORS)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch(
      'https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC&limit=5',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) throw new Error(`Kalshi HTTP ${r.status}`);
    const d = await r.json();
    const mkts = d?.markets || [];
    const m = mkts.find(mk => mk.yes_bid != null && mk.yes_ask != null);
    if (!m) return res.status(503).json({ error: 'No Kalshi market quotes', ts: Date.now() });

    return res.status(200).json({
      yes_bid: m.yes_bid,
      yes_ask: m.yes_ask,
      ticker: m.ticker,
      title: m.title,
      ts: Date.now(),
    });
  } catch (e) {
    return res.status(503).json({ error: e.message, ts: Date.now() });
}
