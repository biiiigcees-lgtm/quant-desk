export function calculateRequestedSize(signal, portfolio, trading) {
    const confidenceFactor = Math.max(0, Math.min(1, Math.abs(signal.score) / 100));
    const riskBudget = portfolio.bank * Math.max(0, trading.riskLimit);
    const rawSize = riskBudget * confidenceFactor;
    const bounded = Math.min(rawSize, trading.maxPositionSize);
    return Math.max(0, Number(bounded.toFixed(4)));
}
export function calculateLimitPrice(signal) {
    const base = signal.finalSignal === 'YES' ? 0.5 : 0.5;
    const skew = Math.min(0.2, Math.abs(signal.score) / 500);
    return signal.finalSignal === 'YES' ? base + skew : base - skew;
}
export function estimateExposureAfterTrade(portfolio, requestedSize) {
    return portfolio.currentExposure + requestedSize;
}
