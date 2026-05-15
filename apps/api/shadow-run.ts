import { simulateShadow } from '../../core/shadow/simulator';
import { createLogger } from '../../infra/logger';

const logger = createLogger('API:ShadowRun');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { direction, probability, payout = 100, loss = 100, outcome } = req.body;

    if (!direction || !probability) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = simulateShadow(direction, probability, payout, loss, outcome ?? Math.random() > 0.5);

    res.status(200).json(result);
  } catch (error) {
    logger.error('Shadow run error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
