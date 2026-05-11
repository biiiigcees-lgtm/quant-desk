export function loadConfig() {
    const apiKey = process.env.KALSHI_API_KEY || 'demo';
    const wsUrl = process.env.KALSHI_WS_URL || 'wss://api.elections.kalshi.com/ws';
    return {
        kalshi: {
            apiKey,
            wsUrl,
            contractIds: process.env.CONTRACT_IDS?.split(',') || [],
            pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '1000', 10),
        },
        trading: {
            initialBank: parseFloat(process.env.INITIAL_BANK || '1000'),
            maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '100'),
            maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '500'),
            minConfidence: parseFloat(process.env.MIN_CONFIDENCE || '0.6'),
            minAgreement: parseFloat(process.env.MIN_AGREEMENT || '0.6'),
            minScore: parseFloat(process.env.MIN_SCORE || '40'),
            riskLimit: parseFloat(process.env.RISK_LIMIT || '0.02'),
        },
        features: {
            priceHistoryLength: parseInt(process.env.PRICE_HISTORY_LENGTH || '100', 10),
            emaShortPeriod: parseInt(process.env.EMA_SHORT_PERIOD || '3', 10),
            emaLongPeriod: parseInt(process.env.EMA_LONG_PERIOD || '21', 10),
            rsiPeriod: parseInt(process.env.RSI_PERIOD || '14', 10),
            macdFastPeriod: parseInt(process.env.MACD_FAST_PERIOD || '12', 10),
            macdSlowPeriod: parseInt(process.env.MACD_SLOW_PERIOD || '26', 10),
            macdSignalPeriod: parseInt(process.env.MACD_SIGNAL_PERIOD || '9', 10),
        },
        strategies: {
            momentumWeight: parseFloat(process.env.MOMENTUM_WEIGHT || '0.25'),
            meanReversionWeight: parseFloat(process.env.MEAN_REVERSION_WEIGHT || '0.25'),
            liquidityWeight: parseFloat(process.env.LIQUIDITY_WEIGHT || '0.25'),
            timeDecayWeight: parseFloat(process.env.TIME_DECAY_WEIGHT || '0.25'),
        },
        api: {
            enabled: (process.env.API_ENABLED || 'true').toLowerCase() === 'true',
            host: process.env.API_HOST || '127.0.0.1',
            port: parseInt(process.env.API_PORT || '8787', 10),
        },
        simulationMode: (process.env.SIMULATION_MODE || 'true').toLowerCase() === 'true',
        logLevel: (process.env.LOG_LEVEL || 'info'),
    };
}
