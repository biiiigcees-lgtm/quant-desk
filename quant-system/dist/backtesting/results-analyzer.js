export function analyzeTrades(trades) {
    let peak = 0;
    let equity = 0;
    let maxDrawdown = 0;
    for (const trade of trades) {
        equity += trade.pnl;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }
    const wins = trades.filter((t) => t.pnl > 0).length;
    const losses = trades.filter((t) => t.pnl <= 0).length;
    const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    return {
        totalTrades: trades.length,
        wins,
        losses,
        winRate: trades.length ? wins / trades.length : 0,
        netPnl,
        maxDrawdown,
        trades,
    };
}
