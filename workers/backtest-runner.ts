import { redisGet, redisSet } from '../infra/redis';
import { createLogger } from '../infra/logger';
import { analyze } from '../core/engine/analyze';
import { Candle, OrderBook } from '../core/features';

const logger = createLogger('BacktestRunner');

export async function backtestRunner(): Promise<void> {
  logger.info('Starting backtest runner');

  while (true) {
    try {
      const candles = await redisGet<Candle[]>('backtest:candles');
      if (!candles || candles.length < 30) {
        logger.info('No candles for backtest, waiting...');
        await sleep(60000);
        continue;
      }

      let totalPnL = 0;
      let wins = 0;
      let losses = 0;

      for (let i = 30; i < candles.length; i++) {
        const snapshotCandles = candles.slice(0, i);
        const orderbook: OrderBook = { bids: [[candles[i].close - 10, 1]], asks: [[candles[i].close + 10, 1]] };
        const snapshot = { candles: snapshotCandles, orderbook, currentPrice: candles[i].close, timestamp: Date.now() };

        const result = await analyze(snapshot);
        if (result.action === 'TRADE') {
          const outcome = candles[i + 1] ? (result.direction === 'ABOVE' ? candles[i + 1].close > candles[i].close : candles[i + 1].close < candles[i].close) : Math.random() > 0.5;
          const pnl = outcome ? 100 : -100;
          totalPnL += pnl;
          if (outcome) wins++; else losses++;
        }
      }

      const backtestResult = { totalPnL, wins, losses, winRate: wins / (wins + losses) };
      await redisSet('backtest:results', backtestResult, 600);
      logger.info(`Backtest complete: PnL=${totalPnL}, WinRate=${backtestResult.winRate.toFixed(2)}`);

      await sleep(600000);
    } catch (error) {
      logger.error('Backtest error', error);
      await sleep(60000);
    }
  }
}

if (require.main === module) {
  backtestRunner().catch(console.error);
}
