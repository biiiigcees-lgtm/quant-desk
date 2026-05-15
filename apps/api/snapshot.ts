import { redisGet } from '../../infra/redis';
import { createLogger } from '../../infra/logger';

const logger = createLogger('API:Snapshot');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const snapshot = await redisGet('snapshot:latest');
    if (!snapshot) return res.status(404).json({ error: 'No snapshot available' });

    res.status(200).json(snapshot);
  } catch (error) {
    logger.error('Snapshot error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
