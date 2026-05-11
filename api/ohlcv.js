const CRYPTOCOMPARE_OHLCV_URL = 'https://min-api.cryptocompare.com/data/v2/histominute?fsym=BTC&tsym=USD&limit=200&aggregate=15';

function normalizeCandle(candle) {
  return {
    time: Number(candle.time),
    low: Number(candle.low),
    high: Number(candle.high),
    open: Number(candle.open),
    close: Number(candle.close),
    volume: Number(candle.volumefrom ?? candle.volume ?? 0),
  };
}

function isValidCandle(candle) {
  return Number.isFinite(candle.time)
    && Number.isFinite(candle.low)
    && Number.isFinite(candle.high)
    && Number.isFinite(candle.open)
    && Number.isFinite(candle.close)
    && Number.isFinite(candle.volume)
    && candle.low > 0
    && candle.high > 0
    && candle.open > 0
    && candle.close > 0
    && candle.high >= candle.low
    && candle.volume >= 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await fetch(CRYPTOCOMPARE_OHLCV_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`CryptoCompare HTTP ${response.status}`);

    const payload = await response.json();
    const rows = payload?.Data?.Data;
    if (!Array.isArray(rows)) throw new Error('CryptoCompare returned no candle data');

    const candles = rows
      .map(normalizeCandle)
      .filter(isValidCandle)
      .sort((a, b) => a.time - b.time)
      .filter((candle, index, all) => index === 0 || candle.time > all[index - 1].time);

    if (candles.length < 50) throw new Error('Insufficient OHLCV history');

    return res.status(200).json({
      candles,
      source: 'cryptocompare',
      ts: Date.now(),
    });
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
}
