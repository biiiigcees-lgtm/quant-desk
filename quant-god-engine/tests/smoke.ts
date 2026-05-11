import { EventBus } from '../core/event-bus/bus.js';
import { EVENTS } from '../core/event-bus/events.js';
import { MarketDataService } from '../services/market-data/service.js';
import { MicrostructureEngine } from '../services/microstructure-engine/service.js';
import { FeatureEngine } from '../services/feature-engine/service.js';
import { ProbabilityEngine } from '../services/probability-engine/service.js';
import { Logger } from '../core/telemetry/logger.js';

async function runSmoke(): Promise<void> {
  const bus = new EventBus();
  const logger = new Logger('smoke');
  const market = new MarketDataService(bus, logger);
  const micro = new MicrostructureEngine(bus, logger);
  const feature = new FeatureEngine(bus);
  const prob = new ProbabilityEngine(bus);

  let seen = 0;
  bus.on(EVENTS.PROBABILITY, () => {
    seen += 1;
    if (seen >= 3) {
      market.stop();
      process.stdout.write('smoke-ok\n');
      process.exit(0);
    }
  });

  micro.start();
  feature.start();
  prob.start();
  market.start('KXBTC-SMOKE');

  setTimeout(() => {
    market.stop();
    process.stderr.write('smoke-timeout\n');
    process.exit(1);
  }, 8000);
}

void runSmoke();
