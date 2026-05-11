import { startSystem } from '../app/system.js';

async function run(): Promise<void> {
  const system = await startSystem();

  const shutdown = async () => {
    await system.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

run().catch((error) => {
  console.error('Failed to start live system:', error);
  process.exit(1);
});
