export function createPositionFromOrder(order) {
    const now = Date.now();
    return {
        positionId: `pos-${order.clientOrderId}`,
        contractId: order.contractId,
        side: order.side,
        entryPrice: order.price,
        size: order.filledSize,
        openedAt: order.filledAt ?? now,
        expiresAt: now + 15 * 60 * 1000,
        currentPrice: order.price,
        currentPnL: 0,
        status: 'open',
    };
}
export function markToMarket(position, currentYesPrice) {
    const mark = position.side === 'YES' ? currentYesPrice : 1 - currentYesPrice;
    const entry = position.side === 'YES' ? position.entryPrice : 1 - position.entryPrice;
    const pnl = (mark - entry) * position.size;
    return {
        ...position,
        currentPrice: currentYesPrice,
        currentPnL: pnl,
    };
}
export function shouldClosePosition(position, timestamp) {
    return timestamp >= position.expiresAt;
}
