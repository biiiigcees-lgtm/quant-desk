import { EventBus, EVENTS, Logger } from '../core/index.js';
async function replay() {
    const eventBus = new EventBus();
    const logger = new Logger('info');
    eventBus.on(EVENTS.MARKET_UPDATE, (update) => {
        logger.info('Replay market update', update);
    });
    const now = Date.now();
    const updates = [
        {
            contractId: 'KXBTC-REPLAY',
            yesPrice: 0.51,
            noPrice: 0.49,
            impliedProb: 0.51,
            volume: 100,
            timestamp: now,
            bids: [[0.5, 100]],
            asks: [[0.52, 90]],
        },
        {
            contractId: 'KXBTC-REPLAY',
            yesPrice: 0.54,
            noPrice: 0.46,
            impliedProb: 0.54,
            volume: 140,
            timestamp: now + 1000,
            bids: [[0.53, 150]],
            asks: [[0.55, 120]],
        },
    ];
    for (const update of updates) {
        eventBus.emit(EVENTS.MARKET_UPDATE, update);
    }
}
replay().catch((error) => {
    console.error('Replay failed:', error);
    process.exit(1);
});
