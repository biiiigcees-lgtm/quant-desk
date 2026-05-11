export function observeMarket(signal, portfolio) {
    const exposureRatio = portfolio.bank > 0 ? portfolio.currentExposure / portfolio.bank : 0;
    return {
        contractId: signal.contractId,
        signalDirection: signal.finalSignal,
        signalScore: signal.score,
        agreement: signal.agreement,
        exposureRatio,
        sessionPnl: portfolio.sessionPnL,
    };
}
