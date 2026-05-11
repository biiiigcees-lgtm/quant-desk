import { EventBus, EVENTS, Logger, MarketUpdate } from '../../core/index.js';
import { KalshiClient } from './kalshi-client.js';
import { normalizeKalshiEvent, extractOrderBookImbalance } from './market-normalizer.js';

export class MarketDataService {
  private readonly eventBus: EventBus;
  private readonly kalshiClient: KalshiClient;
  private readonly logger: Logger;
  private readonly contractIds: string[];

  constructor(eventBus: EventBus, kalshiClient: KalshiClient, logger: Logger, contractIds: string[]) {
    this.eventBus = eventBus;
    this.kalshiClient = kalshiClient;
    this.logger = logger;
    this.contractIds = contractIds;
  }

  async start(): Promise<void> {
    try {
      await this.kalshiClient.connect();

      // Subscribe to contract updates
      this.kalshiClient.onMessage((data) => {
        this.handleKalshiMessage(data);
      });

      // Subscribe to relevant contracts
      this.contractIds.forEach((contractId) => {
        this.kalshiClient.send({
          type: 'subscribe',
          channel: 'market_data',
          contract_id: contractId,
        });
      });

      this.logger.info('Market data service started');
      this.eventBus.emit(EVENTS.MARKET_CONNECT, {
        timestamp: Date.now(),
        contracts: this.contractIds,
      });
    } catch (e) {
      this.logger.error('Failed to start market data service', { error: String(e) });
      this.eventBus.emit(EVENTS.MARKET_ERROR, {
        error: String(e),
      });
      throw e;
    }
  }

  private handleKalshiMessage(data: any): void {
    if (data.type === 'market_update') {
      const update = normalizeKalshiEvent(data, this.logger);
      if (update) {
        extractOrderBookImbalance(update.bids, update.asks);
        const enrichedUpdate: MarketUpdate = {
          ...update,
          bids: update.bids || [],
          asks: update.asks || [],
        };
        this.eventBus.emit(EVENTS.MARKET_UPDATE, enrichedUpdate);
      }
    }
  }

  stop(): void {
    this.kalshiClient.disconnect();
    this.eventBus.emit(EVENTS.MARKET_DISCONNECT, {
      timestamp: Date.now(),
    });
  }
}
