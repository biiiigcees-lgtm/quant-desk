import { createLogger } from '../../infra/logger';
const logger = createLogger('API:Derivatives');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const r = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT');
    const d = await r.json();
    const t = d.result?.list?.[0];
    if (!t) throw new Error('No data');
    const fundingRate = parseFloat(t.fundingRate || '0');
    res.json({ fundingRate, fundingRatePct: fundingRate * 100, annualizedPct: fundingRate * 100 * 3 * 365, markPrice: t.markPrice, source: 'bybit', ts: Date.now() });
  } catch (e: any) {
    res.status(503).json({ error: e?.message || 'Unknown error' });
  }
}
