import { redisGet, redisSet } from '../infra/redis';
import { createLogger } from '../infra/logger';
import { createRandomGenome, StrategyGenome } from '../core/invention/genome';
import { mutateGenome, crossover } from '../core/invention/mutation';
import { selectTopPerformers, updatePerformance } from '../core/invention/selection';
import { env } from '../infra/env';

const logger = createLogger('StrategyEvolver');

export async function strategyEvolver(): Promise<void> {
  logger.info('Starting strategy evolution worker');

  while (true) {
    try {
      const population = await redisGet<StrategyGenome[]>('strategies:population') || [];

      if (population.length === 0) {
        logger.info('Initializing population');
        const initialPopulation = Array.from({ length: env.POPULATION_SIZE }, (_, i) =>
          createRandomGenome(`genome_${i}`, 0)
        );
        await redisSet('strategies:population', initialPopulation);
        continue;
      }

      // Simulate performance updates
      const updatedPopulation = population.map(genome => {
        const pnl = (Math.random() - 0.4) * 100;
        const outcome = pnl > 0;
        return updatePerformance(genome, pnl, outcome);
      });

      // Select top performers
      const topPerformers = selectTopPerformers(updatedPopulation, Math.floor(env.POPULATION_SIZE * 0.3));

      // Create new generation
      const newGeneration: StrategyGenome[] = [...topPerformers];

      while (newGeneration.length < env.POPULATION_SIZE) {
        const parent1 = topPerformers[Math.floor(Math.random() * topPerformers.length)];
        const parent2 = topPerformers[Math.floor(Math.random() * topPerformers.length)];
        const child = crossover(parent1, parent2);
        const mutated = mutateGenome(child);
        newGeneration.push(mutated);
      }

      await redisSet('strategies:population', newGeneration);
      logger.info(`Evolution complete: generation ${newGeneration[0].generation}`);

      await sleep(env.GENERATION_INTERVAL_MS);
    } catch (error) {
      logger.error('Evolution error', error);
      await sleep(60000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  strategyEvolver().catch(console.error);
}
