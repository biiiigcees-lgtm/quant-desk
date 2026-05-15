import { redisGet } from '../../infra/redis';
import { createLogger } from '../../infra/logger';

const logger = createLogger('API:Regime');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const snapshot = await redisGet<any>('snapshot:latest');
    if (!snapshot) return res.status(404).json({ error: 'No snapshot available' });

    const regimeHistory = await redisGet<any>('regime:history') || [];

    res.status(200).json({ current: snapshot.metadata, history: regimeHistory });
  } catch (error) {
    logger.error('Regime error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
