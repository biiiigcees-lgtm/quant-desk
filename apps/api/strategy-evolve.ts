import { redisGet, redisSet } from '../../infra/redis';
import { createLogger } from '../../infra/logger';
import { selectTopPerformers, StrategyGenome } from '../../core/invention/genome';

const logger = createLogger('API:StrategyEvolve');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const population = await redisGet<StrategyGenome[]>('strategies:population') || [];
    const top = selectTopPerformers(population, 5);

    await redisSet('strategies:best', top[0]);

    res.status(200).json({ top, total: population.length });
  } catch (error) {
    logger.error('Strategy evolve error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
