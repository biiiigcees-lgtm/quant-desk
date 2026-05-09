// Kalshi market price proxy
// Falls back gracefully if no KALSHI_API_KEY is set
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { strikePrice } = req.body || {};
  const apiKey = process.env.KALSHI_API_KEY;

  if (!apiKey) {
    // No key — return null so client uses synthetic model
    return res.status(200).json({ available: false, reason: 'No KALSHI_API_KEY configured' });
  }

  try {
    // Build current 15-min ticker
    const now = new Date();
    const minute = Math.ceil(now.getUTCMinutes() / 15) * 15;
    const closeTime = new Date(now);
    closeTime.setUTCMinutes(minute, 0, 0);
    const ticker = `KXBTC-${closeTime.toISOString().slice(2,4)}${closeTime.toISOString().slice(5,7)}${closeTime.toISOString().slice(8,10)}${closeTime.toISOString().slice(11,13)}${closeTime.toISOString().slice(14,16)}`;

    const r = await fetch(`https://trading-api.kalshi.com/trade-api/v2/markets/${ticker}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
    });

    if (!r.ok) return res.status(200).json({ available: false, reason: `Kalshi ${r.status}` });

    const d = await r.json();
    const market = d.market || {};
    return res.status(200).json({
      available: true,
      ticker,
      yesAsk:  market.yes_ask,
      yesBid:  market.yes_bid,
      noAsk:   market.no_ask,
      noBid:   market.no_bid,
      lastPrice: market.last_price,
      volume:    market.volume,
      closeTime: market.close_time,
    });
  } catch(e) {
    return res.status(200).json({ available: false, reason: e.message });
  }
}
