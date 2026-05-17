export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Redis (Upstash)
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_REST_URL: process.env.REDIS_REST_URL,
  REDIS_REST_TOKEN: process.env.REDIS_REST_TOKEN,
  
  // Kalshi
  KALSHI_API_KEY: process.env.KALSHI_API_KEY,
  KALSHI_API_URL: process.env.KALSHI_API_URL || 'https://api.elections.kalshi.com/trade-api/v2',
  
  // OpenRouter (AI)
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  
  // Coinbase
  COINBASE_WS_URL: process.env.COINBASE_WS_URL || 'wss://ws-feed.exchange.coinbase.com',
  COINBASE_API_URL: process.env.COINBASE_API_URL || 'https://api.exchange.coinbase.com',
  
  // Bybit
  BYBIT_API_URL: process.env.BYBIT_API_URL || 'https://api.bybit.com/v5',
  
  // CryptoCompare
  CRYPTOCOMPARE_API_KEY: process.env.CRYPTOCOMPARE_API_KEY,
  CRYPTOCOMPARE_API_URL: process.env.CRYPTOCOMPARE_API_URL || 'https://min-api.cryptocompare.com/data',
  
  // Risk thresholds
  MIN_CONFIDENCE: parseFloat(process.env.MIN_CONFIDENCE || '0.7'),
  MIN_DATA_HEALTH: parseFloat(process.env.MIN_DATA_HEALTH || '0.8'),
  MAX_DRAWDOWN_PCT: parseFloat(process.env.MAX_DRAWDOWN_PCT || '0.05'),
  
  // Evolution
  POPULATION_SIZE: parseInt(process.env.POPULATION_SIZE || '50'),
  MUTATION_RATE: parseFloat(process.env.MUTATION_RATE || '0.1'),
  GENERATION_INTERVAL_MS: parseInt(process.env.GENERATION_INTERVAL_MS || '300000'),
  
  // Calibration
  CALIBRATION_WINDOW: parseInt(process.env.CALIBRATION_WINDOW || '100'),
  
  // Kill switch
  KILL_SWITCH_ENABLED: process.env.KILL_SWITCH_ENABLED === 'true',
};

export function validateEnv(): void {
  const required: (keyof typeof env)[] = [
    'REDIS_URL',
    'KALSHI_API_KEY',
  ];
  
  const missing = required.filter(key => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
