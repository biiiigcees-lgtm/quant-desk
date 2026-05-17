export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  meta?: Record<string, any>;
}

/**
 * Lightweight structured JSON logger.
 * Zero dependencies. Outputs JSON lines compatible with log aggregators (Datadog, Loki, etc.).
 * Mirrors infra/logger.ts intentionally to keep quant-core self-contained.
 */
class Logger {
  private level: LogLevel;
  private context: string;

  constructor(context: string, level: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      meta: meta !== undefined ? (typeof meta === 'object' ? meta : { value: meta }) : undefined,
    };
    return JSON.stringify(entry);
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message, meta));
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, meta));
    }
  }

  error(message: string, error?: Error | any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const meta = error instanceof Error
        ? { error: error.message, stack: error.stack }
        : error;
      console.error(this.formatMessage('ERROR', message, meta));
    }
  }
}

function createLogger(context: string, level?: LogLevel): Logger {
  const envLevel = process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG :
                  process.env.LOG_LEVEL === 'warn' ? LogLevel.WARN :
                  process.env.LOG_LEVEL === 'error' ? LogLevel.ERROR :
                  LogLevel.INFO;
  return new Logger(context, level ?? envLevel);
}

const logger = createLogger('quant-core');

export function logTradeDecision(
  symbol: string,
  action: string,
  confidence: number,
  regime: string
): void {
  logger.info('Trade decision made', {
    event: 'trade_decision',
    symbol,
    action,
    confidence,
    regime,
    timestamp: Date.now(),
  });
}

export function logRegimeChange(
  symbol: string,
  oldRegime: string,
  newRegime: string,
  probability: number
): void {
  logger.info('Regime change detected', {
    event: 'regime_change',
    symbol,
    oldRegime,
    newRegime,
    probability,
    timestamp: Date.now(),
  });
}

export function logSignalFusion(
  symbol: string,
  signals: Record<string, any>,
  probabilityLong: number,
  probabilityShort: number
): void {
  logger.info('Signal fusion computed', {
    event: 'signal_fusion',
    symbol,
    signals,
    probabilityLong,
    probabilityShort,
    timestamp: Date.now(),
  });
}

export function logDataFeedStatus(
  exchange: string,
  feedType: string,
  status: 'connected' | 'disconnected' | 'error',
  error?: string
): void {
  const meta = {
    event: 'data_feed_status',
    exchange,
    feedType,
    status,
    error,
    timestamp: Date.now(),
  };

  if (status === 'error') {
    logger.error(`Data feed ${feedType} on ${exchange}: ${status}`, meta);
  } else {
    logger.info(`Data feed ${feedType} on ${exchange}: ${status}`, meta);
  }
}

export function logBacktestResult(
  symbol: string,
  totalPnL: number,
  winRate: number,
  sharpeRatio: number,
  maxDrawdown: number
): void {
  logger.info('Backtest completed', {
    event: 'backtest_result',
    symbol,
    totalPnL,
    winRate,
    sharpeRatio,
    maxDrawdown,
    timestamp: Date.now(),
  });
}

export function logNoiseDetection(
  symbol: string,
  noiseScore: number,
  suspiciousActivities: string[]
): void {
  if (noiseScore > 0.5) {
    logger.warn('High noise detected', {
      event: 'noise_detection',
      symbol,
      noiseScore,
      suspiciousActivities,
      timestamp: Date.now(),
    });
  }
}

export function logLiquidityPressure(
  symbol: string,
  pressure: number,
  direction: string,
  intensity: string
): void {
  logger.info('Liquidity pressure updated', {
    event: 'liquidity_pressure',
    symbol,
    pressure,
    direction,
    intensity,
    timestamp: Date.now(),
  });
}

export function logError(error: Error, context?: Record<string, any>): void {
  logger.error('Error occurred', {
    event: 'error',
    error: error.message,
    stack: error.stack,
    context,
    timestamp: Date.now(),
  });
}

export function logInfo(message: string, meta?: Record<string, any>): void {
  logger.info(message, {
    ...meta,
    timestamp: Date.now(),
  });
}

export default logger;