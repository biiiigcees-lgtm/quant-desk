/**
 * Normalize raw Kalshi events into MarketUpdate
 */
export function normalizeKalshiEvent(raw, logger) {
    try {
        if (!raw.contract_id || typeof raw.yes_price !== 'number' || typeof raw.no_price !== 'number') {
            logger.debug('Invalid Kalshi event structure', { raw });
            return null;
        }
        const total = raw.yes_price + raw.no_price;
        const impliedProb = total > 0 ? raw.yes_price / total : 0.5;
        const update = {
            contractId: raw.contract_id,
            yesPrice: raw.yes_price,
            noPrice: raw.no_price,
            impliedProb: Math.max(0.01, Math.min(0.99, impliedProb)),
            volume: raw.volume || 0,
            timestamp: raw.timestamp || Date.now(),
            bids: raw.bids || [],
            asks: raw.asks || [],
        };
        return update;
    }
    catch (e) {
        logger.warn('Failed to normalize Kalshi event', { error: String(e) });
        return null;
    }
}
/**
 * Extract order book imbalance from Kalshi order book
 */
export function extractOrderBookImbalance(bids, asks) {
    if (!bids || !asks)
        return 0;
    const bidVolume = bids.reduce((sum, [, size]) => sum + size, 0);
    const askVolume = asks.reduce((sum, [, size]) => sum + size, 0);
    const total = bidVolume + askVolume;
    if (total === 0)
        return 0;
    // Positive = buy pressure (more bid volume)
    return (bidVolume - askVolume) / total;
}
