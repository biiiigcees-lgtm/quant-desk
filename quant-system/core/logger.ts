export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  data?: any;
}

export class Logger {
  private readonly minLevel: LogLevel;
  private readonly levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, data?: any): LogEntry {
    return {
      level,
      timestamp: new Date().toISOString(),
      message,
      data,
    };
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      const entry = this.formatEntry('debug', message, data);
      console.log(JSON.stringify(entry));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      const entry = this.formatEntry('info', message, data);
      console.log(JSON.stringify(entry));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      const entry = this.formatEntry('warn', message, data);
      console.warn(JSON.stringify(entry));
    }
  }

  error(message: string, data?: any): void {
    if (this.shouldLog('error')) {
      const entry = this.formatEntry('error', message, data);
      console.error(JSON.stringify(entry));
    }
  }
}
