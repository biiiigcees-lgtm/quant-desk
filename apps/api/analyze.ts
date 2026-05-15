import { analyze } from '../../core/engine/analyze';
import { redisGet } from '../../infra/redis';
import { createLogger } from '../../infra/logger';

const logger = createLogger('API:Analyze');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const snapshot = await redisGet<any>('snapshot:latest');
    if (!snapshot) return res.status(503).json({ error: 'No snapshot available' });

    const calibrationState = await redisGet<any>('calibration:state');
    const strategyGenome = await redisGet<any>('strategies:best');

    const result = await analyze(snapshot, strategyGenome, calibrationState);

    res.status(200).json(result);
  } catch (error) {
    logger.error('Analyze error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
