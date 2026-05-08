// BTC derivatives data — funding rate, OI from Bybit
// Server-side to avoid CORS/geo issues (fapi.binance.com is geo-blocked from US)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [tickerRes, oiRes] = await Promise.allSettled([
      fetchBybitTicker(),
      fetchBybitOI(),
    ]);

    const ticker = tickerRes.status === 'fulfilled' ? tickerRes.value : null;
    const oi     = oiRes.status     === 'fulfilled' ? oiRes.value     : null;

    if (!ticker) {
      return res.status(503).json({
        error: 'Derivatives data unavailable',
        reason: tickerRes.reason?.message,
      });
    }

    const fundingRate   = ticker.fundingRate;
    const annualized    = fundingRate * 3 * 365; // 3 payments/day * 365
    const nextFunding   = ticker.nextFundingTime;
    const countdown     = Math.max(0, nextFunding - Date.now());
    const countdownMin  = Math.floor(countdown / 60000);
    const countdownSec  = Math.floor((countdown % 60000) / 1000);

    return res.status(200).json({
      fundingRate,
      fundingRatePct: +(fundingRate * 100).toFixed(4),
      annualizedPct:  +(annualized * 100).toFixed(2),
      nextFundingTime: nextFunding,
      fundingCountdown: `${String(countdownMin).padStart(2,'0')}:${String(countdownSec).padStart(2,'0')}`,
      fundingCountdownMs: countdown,
      openInterest:   oi?.openInterest   ?? null,
      openInterestUsd: oi?.openInterestUsd ?? null,
      markPrice:      ticker.markPrice,
      indexPrice:     ticker.indexPrice,
      source: 'bybit',
      ts: Date.now(),
    });
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }
}

async function fetchBybitTicker() {
  const r = await fetch(
    'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
    { signal: AbortSignal.timeout(4000) }
  );
  if (!r.ok) throw new Error(`Bybit linear ticker HTTP ${r.status}`);
  const d = await r.json();
  if (d.retCode !== 0) throw new Error(d.retMsg);
  const t = d.result?.list?.[0];
  if (!t) throw new Error('No Bybit linear ticker data');
  return {
    fundingRate:     parseFloat(t.fundingRate) || 0,
    nextFundingTime: parseInt(t.nextFundingTime) || Date.now() + 28800000,
    markPrice:       parseFloat(t.markPrice) || 0,
    indexPrice:      parseFloat(t.indexPrice) || 0,
  };
}

async function fetchBybitOI() {
  const r = await fetch(
    'https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min&limit=2',
    { signal: AbortSignal.timeout(4000) }
  );
  if (!r.ok) throw new Error(`Bybit OI HTTP ${r.status}`);
  const d = await r.json();
  if (d.retCode !== 0) throw new Error(d.retMsg);
  const list = d.result?.list;
  if (!list?.length) return null;
  const latest  = parseFloat(list[0].openInterest);
  const prev    = list[1] ? parseFloat(list[1].openInterest) : latest;
  // openInterestValue from Bybit is the notional USD value of the OI
  const oiUsd   = parseFloat(list[0].openInterestValue || 0);
  return {
    openInterest:    latest,
    openInterestUsd: oiUsd,
    oiDelta:         latest - prev,
    oiDeltaPct:      prev > 0 ? ((latest - prev) / prev * 100) : 0,
  };
}
