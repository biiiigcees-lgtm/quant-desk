import { redisGet, redisSet } from '../infra/redis';
import { createLogger } from '../infra/logger';
import { runStressTest, StressScenario } from '../core/adversarial/stress';

const logger = createLogger('AdversarialRunner');

export async function adversarialRunner(): Promise<void> {
  logger.info('Starting adversarial stress testing');

  const scenarios: StressScenario[] = [
    { type: 'VOLATILITY_SPIKE', severity: 0.5 },
    { type: 'LIQUIDITY_COLLAPSE', severity: 0.7 },
    { type: 'NOISE_INJECTION', severity: 0.3 },
    { type: 'REGIME_FLIP', severity: 0.8 },
  ];

  while (true) {
    try {
      const results = scenarios.map(scenario => runStressTest(scenario));
      const avgRobustness = results.reduce((sum, r) => sum + r.robustnessScore, 0) / results.length;

      await redisSet('adversarial:results', results, 300);
      logger.info(`Stress test complete: avg robustness=${avgRobustness.toFixed(2)}`);

      await sleep(300000);
    } catch (error) {
      logger.error('Adversarial error', error);
      await sleep(60000);
    }
  }
}

if (require.main === module) {
  adversarialRunner().catch(console.error);
}
