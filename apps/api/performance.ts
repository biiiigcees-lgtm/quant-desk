import { redisGet } from '../../infra/redis';
import { createLogger } from '../../infra/logger';

const logger = createLogger('API:Performance');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const backtest = await redisGet('backtest:results');
    const adversarial = await redisGet('adversarial:results');
    const calibration = await redisGet('calibration:state');

    res.status(200).json({ backtest, adversarial, calibration });
  } catch (error) {
    logger.error('Performance error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
