const KALSHI_OPEN_MARKETS_URL = 'https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC&status=open&limit=50';
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

  return {
    yesBid: inferredBid,
    yesAsk: inferredAsk,
  };
}

function computeMidPrice(yesBid, yesAsk) {
  if (Number.isFinite(yesBid) && Number.isFinite(yesAsk)) return (yesBid + yesAsk) / 2;
  if (Number.isFinite(yesBid)) return yesBid;
  if (Number.isFinite(yesAsk)) return yesAsk;
  return null;
}

function toMarketQuote(market) {
  const yesBidRaw = parsePrice(market.yes_bid_dollars ?? market.yes_bid);
  const yesAskRaw = parsePrice(market.yes_ask_dollars ?? market.yes_ask);
  const noBidRaw = parsePrice(market.no_bid_dollars ?? market.no_bid);
  const noAskRaw = parsePrice(market.no_ask_dollars ?? market.no_ask);

  const inferred = inferYesFromNoQuotes(yesBidRaw, yesAskRaw, noBidRaw, noAskRaw);
  const yesBid = normalizeDollarPrice(inferred.yesBid);
  const yesAsk = normalizeDollarPrice(inferred.yesAsk);
  const mid = computeMidPrice(yesBid, yesAsk);

  if (!Number.isFinite(mid) || mid <= 0) return null;

  return {
    yes_bid: Number.isFinite(yesBid) ? yesBid : null,
    yes_ask: Number.isFinite(yesAsk) ? yesAsk : null,
    mid,
    ticker: market.ticker,
    title: market.title,
  };
}

function findBestQuote(markets) {
  for (const market of markets) {
    const quote = toMarketQuote(market);
    if (quote) return quote;
  }
  return null;
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
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Kalshi HTTP ${response.status}`);

    const payload = await response.json();
    const markets = payload?.markets || [];
    const best = findBestQuote(markets);

    if (!best) return res.status(503).json({ error: 'No Kalshi market quotes', ts: Date.now() });

    return res.status(200).json({ ...best, ts: Date.now() });
  } catch (e) {
    return res.status(503).json({ error: e.message, ts: Date.now() });
}

}
