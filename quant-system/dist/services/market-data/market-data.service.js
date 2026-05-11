import { EVENTS } from '../../core/index.js';
import { normalizeKalshiEvent, extractOrderBookImbalance } from './market-normalizer.js';
export class MarketDataService {
    constructor(eventBus, kalshiClient, logger, contractIds) {
        this.eventBus = eventBus;
        this.kalshiClient = kalshiClient;
        this.logger = logger;
        this.contractIds = contractIds;
    }
    async start() {
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
        }
        catch (e) {
            this.logger.error('Failed to start market data service', { error: String(e) });
            this.eventBus.emit(EVENTS.MARKET_ERROR, {
                error: String(e),
            });
            throw e;
        }
    }
    handleKalshiMessage(data) {
        if (data.type === 'market_update') {
            const update = normalizeKalshiEvent(data, this.logger);
            if (update) {
                const obImbalance = extractOrderBookImbalance(update.bids, update.asks);
                const enrichedUpdate = {
                    ...update,
                    bids: update.bids || [],
                    asks: update.asks || [],
                };
                this.eventBus.emit(EVENTS.MARKET_UPDATE, enrichedUpdate);
            }
        }
    }
    stop() {
        this.kalshiClient.disconnect();
        this.eventBus.emit(EVENTS.MARKET_DISCONNECT, {
            timestamp: Date.now(),
        });
    }
}
