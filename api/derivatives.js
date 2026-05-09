// BTC derivatives data — funding rate, OI from Bybit with OKX fallback

const STALE_CACHE_TTL_MS = 180000;
let lastGoodSnapshot = null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [tickerRes, oiRes] = await Promise.allSettled([
      fetchTickerWithFallback(),
      fetchOpenInterestWithFallback(),
    ]);

    const ticker = tickerRes.status === 'fulfilled' ? tickerRes.value : null;
    const oi     = oiRes.status     === 'fulfilled' ? oiRes.value     : null;

    if (!ticker) {
      if (lastGoodSnapshot && Date.now() - lastGoodSnapshot.ts <= STALE_CACHE_TTL_MS) {
        const staleAgeMs = Date.now() - lastGoodSnapshot.ts;
        return res.status(200).json({
          ...lastGoodSnapshot,
          stale: true,
          staleAgeMs,
          source: `${lastGoodSnapshot.source || 'cache'}+stale`,
        });
      }
      return res.status(503).json({
        error: 'Derivatives data unavailable',
        reason: tickerRes.reason?.message,
      });
    }

    const fundingRate   = ticker.fundingRate ?? lastGoodSnapshot?.fundingRate ?? 0;
    const annualized    = fundingRate * 3 * 365; // 3 payments/day * 365
    const nextFunding   = ticker.nextFundingTime ?? lastGoodSnapshot?.nextFundingTime ?? (Date.now() + 28800000);
    const countdown     = Math.max(0, nextFunding - Date.now());
    const countdownMin  = Math.floor(countdown / 60000);
    const countdownSec  = Math.floor((countdown % 60000) / 1000);

    const payload = {
      fundingRate,
      fundingRatePct: +(fundingRate * 100).toFixed(4),
      annualizedPct:  +(annualized * 100).toFixed(2),
      nextFundingTime: nextFunding,
      fundingCountdown: `${String(countdownMin).padStart(2,'0')}:${String(countdownSec).padStart(2,'0')}`,
      fundingCountdownMs: countdown,
      openInterest:   oi?.openInterest ?? lastGoodSnapshot?.openInterest ?? null,
      openInterestUsd: oi?.openInterestUsd ?? lastGoodSnapshot?.openInterestUsd ?? null,
      oiDelta: oi?.oiDelta ?? lastGoodSnapshot?.oiDelta ?? 0,
      oiDeltaPct: oi?.oiDeltaPct ?? lastGoodSnapshot?.oiDeltaPct ?? 0,
      markPrice:      ticker.markPrice ?? lastGoodSnapshot?.markPrice ?? null,
      indexPrice:     ticker.indexPrice ?? lastGoodSnapshot?.indexPrice ?? null,
      source: ticker.source || 'bybit',
      stale: false,
      ts: Date.now(),
    };

    lastGoodSnapshot = payload;
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }
}

async function fetchTickerWithFallback() {
  const errors = [];
  try {
    const bybit = await fetchBybitTicker();
    return { ...bybit, source: 'bybit' };
  } catch (bybitErr) {
    errors.push(`Bybit ticker failed (${bybitErr.message})`);
  }

  try {
    const okx = await fetchOkxTicker();
    return { ...okx, source: 'okx' };
  } catch (okxErr) {
    errors.push(`OKX fallback failed (${okxErr.message})`);
  }

  throw new Error(errors.join('; '));
}

async function fetchOpenInterestWithFallback() {
  const errors = [];
  try {
    return await fetchBybitOI();
  } catch (bybitErr) {
    errors.push(`Bybit OI failed (${bybitErr.message})`);
  }

  try {
    return await fetchOkxOI();
  } catch (okxErr) {
    errors.push(`OKX fallback failed (${okxErr.message})`);
  }

  throw new Error(errors.join('; '));
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
  const fundingRate = Number.parseFloat(t.fundingRate);
  const nextFundingTime = Number.parseInt(t.nextFundingTime, 10);
  const markPrice = Number.parseFloat(t.markPrice);
  const indexPrice = Number.parseFloat(t.indexPrice);
  return {
    fundingRate:     Number.isFinite(fundingRate) ? fundingRate : 0,
    nextFundingTime: Number.isFinite(nextFundingTime) ? nextFundingTime : Date.now() + 28800000,
    markPrice:       Number.isFinite(markPrice) ? markPrice : null,
    indexPrice:      Number.isFinite(indexPrice) ? indexPrice : null,
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
  const latest  = Number.parseFloat(list[0].openInterest);
  const prev    = list[1] ? Number.parseFloat(list[1].openInterest) : latest;
  // openInterestValue from Bybit is the notional USD value of the OI
  const oiUsd   = Number.parseFloat(list[0].openInterestValue || 0);
  return {
    openInterest:    latest,
    openInterestUsd: oiUsd,
    oiDelta:         latest - prev,
    oiDeltaPct:      prev > 0 ? ((latest - prev) / prev * 100) : 0,
  };
}

async function fetchOkxTicker() {
  const fundingRes = await fetch(
    'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP',
    { signal: AbortSignal.timeout(3000) }
  );
  if (!fundingRes.ok) throw new Error(`OKX funding HTTP ${fundingRes.status}`);
  const fundingData = await fundingRes.json();
  if (fundingData.code !== '0') throw new Error(`OKX funding code ${fundingData.code}`);
  const fundingRow = fundingData.data?.[0];
  if (!fundingRow) throw new Error('No OKX funding data');

  const [markRes, indexRes] = await Promise.allSettled([
    fetch('https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP', {
      signal: AbortSignal.timeout(3000),
    }),
    fetch('https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT', {
      signal: AbortSignal.timeout(3000),
    }),
  ]);

  let markPrice = null;
  if (markRes.status === 'fulfilled' && markRes.value.ok) {
    const markData = await markRes.value.json();
    const markVal = Number.parseFloat(markData?.data?.[0]?.markPx);
    if (Number.isFinite(markVal)) markPrice = markVal;
  }

  let indexPrice = null;
  if (indexRes.status === 'fulfilled' && indexRes.value.ok) {
    const indexData = await indexRes.value.json();
    const indexVal = Number.parseFloat(indexData?.data?.[0]?.idxPx);
    if (Number.isFinite(indexVal)) indexPrice = indexVal;
  }

  const fundingRate = Number.parseFloat(fundingRow.fundingRate);
  const nextFundingTime = Number.parseInt(fundingRow.fundingTime, 10);
  return {
    fundingRate: Number.isFinite(fundingRate) ? fundingRate : 0,
    nextFundingTime: Number.isFinite(nextFundingTime) ? nextFundingTime : Date.now() + 28800000,
    markPrice,
    indexPrice,
  };
}

async function fetchOkxOI() {
  const r = await fetch(
    'https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP',
    { signal: AbortSignal.timeout(3000) }
  );
  if (!r.ok) throw new Error(`OKX OI HTTP ${r.status}`);
  const d = await r.json();
  if (d.code !== '0') throw new Error(`OKX OI code ${d.code}`);
  const row = d.data?.[0];
  if (!row) throw new Error('No OKX OI data');

  const oiUsd = Number.parseFloat(row.oiUsd);
  const oiContracts = Number.parseFloat(row.oi);
  const openInterest = Number.isFinite(oiUsd) && oiUsd > 0 ? oiUsd : oiContracts;
  if (!Number.isFinite(openInterest)) throw new Error('Invalid OKX OI payload');

  return {
    openInterest,
    openInterestUsd: Number.isFinite(oiUsd) ? oiUsd : null,
    oiDelta: 0,
    oiDeltaPct: 0,
  };
}
