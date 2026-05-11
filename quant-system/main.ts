import { startSystem } from './app/index.js';

async function main(): Promise<void> {
  const system = await startSystem();

  const shutdown = () => {
    void system.stop().then(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
