export function createInitialPortfolioState(initialBank) {
    return {
        bank: initialBank,
        currentExposure: 0,
        peakBank: initialBank,
        dailyPnL: 0,
        sessionPnL: 0,
        positions: [],
        orders: [],
        timestamp: Date.now(),
    };
}
export function normalizePortfolioState(state, initialBank) {
    return state ?? createInitialPortfolioState(initialBank);
}
