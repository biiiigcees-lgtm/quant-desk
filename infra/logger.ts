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

export class Logger {
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

export function createLogger(context: string, level?: LogLevel): Logger {
  const envLevel = process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG :
                  process.env.LOG_LEVEL === 'warn' ? LogLevel.WARN :
                  process.env.LOG_LEVEL === 'error' ? LogLevel.ERROR :
                  LogLevel.INFO;
  return new Logger(context, level ?? envLevel);
}