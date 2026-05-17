import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface QuantCoreConfig {
  // Exchange connections
  exchanges: {
    binance: { apiKey?: string; apiSecret?: string; baseUrl?: string };
    coinbase: { apiKey?: string; apiSecret?: string; wsUrl?: string };
    bybit: { apiKey?: string; apiSecret?: string };
  };

  // Data source API keys
  dataSources: {
    coinGlass?: string;
    amberdata?: string;
    twitter?: string;
  };

  // Model parameters
  models: {
    hmmStates: number;
    kalmanProcessVar: number;
    kalmanMeasurementVar: number;
    bayesianPrior: number;
    bayesianLearningRate: number;
    agentEpsilon: number;
    replayBufferSize: number;
  };

  // Pipeline settings
  pipeline: {
    updateIntervalMs: number;
    maxTradeSize: number;
    riskPerTrade: number;
    symbols: string[];
    enableBacktesting: boolean;
    enableLiveTrading: boolean;
  };

  // Observability
  observability: {
    logLevel: string;
    metricsPort: number;
    enablePrometheus: boolean;
  };

  // Infrastructure
  infrastructure: {
    redisUrl?: string;
    kafkaBrokers?: string[];
    kafkaClientId: string;
  };
}

const defaultConfig: QuantCoreConfig = {
  exchanges: {
    binance: {
      apiKey: process.env.BINANCE_API_KEY,
      apiSecret: process.env.BINANCE_API_SECRET,
      baseUrl: process.env.BINANCE_BASE_URL || 'wss://stream.binance.com:9443/ws',
    },
    coinbase: {
      apiKey: process.env.COINBASE_API_KEY,
      apiSecret: process.env.COINBASE_API_SECRET,
      wsUrl: process.env.COINBASE_WS_URL || 'wss://advanced-trade-ws.coinbase.com',
    },
    bybit: {
      apiKey: process.env.BYBIT_API_KEY,
      apiSecret: process.env.BYBIT_API_SECRET,
    },
  },
  dataSources: {
    coinGlass: process.env.COINGLASS_API_KEY,
    amberdata: process.env.AMBERDATA_API_KEY,
    twitter: process.env.TWITTER_BEARER_TOKEN,
  },
  models: {
    hmmStates: 5,
    kalmanProcessVar: 1,
    kalmanMeasurementVar: 1,
    bayesianPrior: 0.5,
    bayesianLearningRate: 0.1,
    agentEpsilon: 0.1,
    replayBufferSize: 10000,
  },
  pipeline: {
    updateIntervalMs: parseInt(process.env.PIPELINE_INTERVAL_MS || '60000', 10),
    maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE || '0.1'),
    riskPerTrade: parseFloat(process.env.RISK_PER_TRADE || '0.02'),
    symbols: (process.env.TRADING_SYMBOLS || 'BTCUSDT,ETHUSDT').split(','),
    enableBacktesting: process.env.ENABLE_BACKTESTING !== 'false',
    enableLiveTrading: process.env.ENABLE_LIVE_TRADING === 'true',
  },
  observability: {
    logLevel: process.env.LOG_LEVEL || 'info',
    metricsPort: parseInt(process.env.METRICS_PORT || '9464', 10),
    enablePrometheus: process.env.ENABLE_PROMETHEUS !== 'false',
  },
  infrastructure: {
    redisUrl: process.env.REDIS_URL,
    kafkaBrokers: process.env.KAFKA_BROKERS?.split(',') || [],
    kafkaClientId: process.env.KAFKA_CLIENT_ID || 'quant-core',
  },
};

export function loadConfig(overrides?: Partial<QuantCoreConfig>): QuantCoreConfig {
  if (overrides) {
    return deepMerge(defaultConfig, overrides);
  }
  return defaultConfig;
}

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] as any, source[key] as any);
    } else if (source[key] !== undefined) {
      output[key] = source[key]!;
    }
  }
  return output;
}