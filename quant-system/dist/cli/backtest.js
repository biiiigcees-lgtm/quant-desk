import { buildSyntheticScenario, runBacktest, walkForwardSplit } from '../backtesting/index.js';
function run() {
    const contractId = process.argv[2] || 'KXBTC-BACKTEST';
    const dataset = buildSyntheticScenario(contractId, 240);
    const split = walkForwardSplit(dataset, 0.7);
    const result = runBacktest({ contractId, data: split.test, threshold: 0.012, tradeSize: 100 });
    console.log(JSON.stringify({
        contractId,
        totalTrades: result.totalTrades,
        winRate: result.winRate,
        netPnl: result.netPnl,
        maxDrawdown: result.maxDrawdown,
    }, null, 2));
}
run();
