import { redisSet, redisGet } from '../../infra/redis';
import { createLogger } from '../../infra/logger';

const logger = createLogger('KalshiSync');

const KALSHI_API_KEY = process.env.KALSHI_API_KEY || 'e7d488f2-dde6-4539-855f-0c27303ddb60';
const KALSHI_API_URL = process.env.KALSHI_API_URL || 'https://api.elections.kalshi.com/trade-api/v2';

export interface KalshiMarket {
  id: string;
  ticker: string;
  title: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  close_time: number;
  status: string;
}

export interface KalshiSyncState {
  lastSync: number;
  markets: KalshiMarket[];
  countdown: number;
  cycleStart: number;
}

export class KalshiSync {
  private interval: NodeJS.Timeout | null = null;
  private syncIntervalMs = 60000; // 1 minute

  async sync(): Promise<KalshiSyncState> {
    try {
      const response = await fetch(`${KALSHI_API_URL}/markets?series_ticker=KXBTC&limit=5`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${KALSHI_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      const markets = (data.markets || []) as KalshiMarket[];

      const now = Date.now();
      const cycleStart = Math.floor(now / 900000) * 900000; // 15-min cycle
      const countdown = cycleStart + 900000 - now;

      const state: KalshiSyncState = {
        lastSync: now,
        markets,
        countdown,
        cycleStart,
      };

      await redisSet('kalshi:state', state, 120);
      logger.info(`Kalshi sync complete: ${markets.length} markets, countdown: ${countdown}ms`);

      return state;
    } catch (error) {
      logger.error('Kalshi sync failed', error);
      throw error;
    }
  }

  async getState(): Promise<KalshiSyncState | null> {
    return redisGet<KalshiSyncState>('kalshi:state');
  }

  start(): void {
    if (this.interval) return;

    this.sync(); // Initial sync
    this.interval = setInterval(() => this.sync(), this.syncIntervalMs);
    logger.info('Kalshi sync started');
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Kalshi sync stopped');
    }
  }
}

export function createKalshiSync(): KalshiSync {
  return new KalshiSync();
}
