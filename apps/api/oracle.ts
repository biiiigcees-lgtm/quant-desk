import { createLogger } from '../../infra/logger';

const logger = createLogger('API:Oracle');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=4');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sources = await Promise.allSettled([
      fetch('https://api.binance.us/api/v3/bookTicker?symbol=BTCUSDT', { signal: AbortSignal.timeout(3000) }),
      fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', { signal: AbortSignal.timeout(3000) }),
      fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT', { signal: AbortSignal.timeout(3000) }),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', { signal: AbortSignal.timeout(5000) }),
    ]);

    const results = sources.map((s, i) => {
      const name = ['BINANCE_US', 'KRAKEN', 'BYBIT', 'COINGECKO'][i];
      if (s.status === 'fulfilled') return { exchange: name, ...s.value, ok: true };
      return { exchange: name, price: null, mid: null, ok: false, err: s.reason?.message };
    });

    const validMids = results.filter(r => r.ok && r.mid > 0).map(r => r.mid);
    if (!validMids.length) return res.status(503).json({ error: 'All price sources failed', sources: results });

    const sorted = [...validMids].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];

    const tagged = results.map(r => ({
      ...r, deviation: r.mid ? Math.abs(r.mid - median) / median * 100 : null, outlier: r.mid ? Math.abs(r.mid - median) / median > 0.003 : false
    }));

    const cleanSources = tagged.filter(r => r.ok && !r.outlier);
    const composite = cleanSources.length > 0 ? cleanSources.reduce((a, r) => a + r.mid, 0) / cleanSources.length : median;

    const maxDev = Math.max(...tagged.filter(r => r.ok).map(r => r.deviation || 0), 0);
    const confidence = Math.round(Math.max(0, Math.min(100, 100 - maxDev * 100)));

    res.status(200).json({ price: +composite.toFixed(2), median: +median.toFixed(2), deviation: +(Math.max(...tagged.filter(r => r.ok).map(r => r.deviation || 0), 0)).toFixed(4), confidence, sources: tagged, ts: Date.now() });
  } catch (error) {
    logger.error('Oracle error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
