export interface KalshiConfig {
  apiKey: string;
  wsUrl: string;
  contractIds: string[];
  pollIntervalMs: number;
}

export interface TradingConfig {
  initialBank: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  minConfidence: number;
  minAgreement: number;
  minScore: number;
  riskLimit: number;
}

export interface FeaturesConfig {
  priceHistoryLength: number;
  emaShortPeriod: number;
  emaLongPeriod: number;
  rsiPeriod: number;
  macdFastPeriod: number;
  macdSlowPeriod: number;
  macdSignalPeriod: number;
}

export interface StrategiesConfig {
  momentumWeight: number;
  meanReversionWeight: number;
  liquidityWeight: number;
  timeDecayWeight: number;
}

export interface SystemConfig {
  kalshi: KalshiConfig;
  trading: TradingConfig;
  features: FeaturesConfig;
  strategies: StrategiesConfig;
  api: {
    enabled: boolean;
    host: string;
    port: number;
  };
  simulationMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(): SystemConfig {
  const apiKey = process.env.KALSHI_API_KEY || 'demo';
  const wsUrl = process.env.KALSHI_WS_URL || 'wss://api.elections.kalshi.com/ws';

  return {
    kalshi: {
      apiKey,
      wsUrl,
      contractIds: process.env.CONTRACT_IDS?.split(',') || [],
      pollIntervalMs: Number.parseInt(process.env.POLL_INTERVAL_MS || '1000', 10),
    },
    trading: {
      initialBank: Number.parseFloat(process.env.INITIAL_BANK || '1000'),
      maxPositionSize: Number.parseFloat(process.env.MAX_POSITION_SIZE || '100'),
      maxDailyLoss: Number.parseFloat(process.env.MAX_DAILY_LOSS || '500'),
      minConfidence: Number.parseFloat(process.env.MIN_CONFIDENCE || '0.6'),
      minAgreement: Number.parseFloat(process.env.MIN_AGREEMENT || '0.6'),
      minScore: Number.parseFloat(process.env.MIN_SCORE || '40'),
      riskLimit: Number.parseFloat(process.env.RISK_LIMIT || '0.02'),
    },
    features: {
      priceHistoryLength: Number.parseInt(process.env.PRICE_HISTORY_LENGTH || '100', 10),
      emaShortPeriod: Number.parseInt(process.env.EMA_SHORT_PERIOD || '3', 10),
      emaLongPeriod: Number.parseInt(process.env.EMA_LONG_PERIOD || '21', 10),
      rsiPeriod: Number.parseInt(process.env.RSI_PERIOD || '14', 10),
      macdFastPeriod: Number.parseInt(process.env.MACD_FAST_PERIOD || '12', 10),
      macdSlowPeriod: Number.parseInt(process.env.MACD_SLOW_PERIOD || '26', 10),
      macdSignalPeriod: Number.parseInt(process.env.MACD_SIGNAL_PERIOD || '9', 10),
    },
    strategies: {
      momentumWeight: Number.parseFloat(process.env.MOMENTUM_WEIGHT || '0.25'),
      meanReversionWeight: Number.parseFloat(process.env.MEAN_REVERSION_WEIGHT || '0.25'),
      liquidityWeight: Number.parseFloat(process.env.LIQUIDITY_WEIGHT || '0.25'),
      timeDecayWeight: Number.parseFloat(process.env.TIME_DECAY_WEIGHT || '0.25'),
    },
    api: {
      enabled: (process.env.API_ENABLED || 'true').toLowerCase() === 'true',
      host: process.env.API_HOST || '127.0.0.1',
      port: Number.parseInt(process.env.API_PORT || '8787', 10),
    },
    simulationMode: (process.env.SIMULATION_MODE || 'true').toLowerCase() === 'true',
    logLevel: (process.env.LOG_LEVEL || 'info') as any,
  };
}
