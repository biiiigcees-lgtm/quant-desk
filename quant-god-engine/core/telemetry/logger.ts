export class Logger {
  constructor(private readonly service: string) {}

  private write(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    process.stdout.write(
      `${JSON.stringify({ level, service: this.service, message, data, ts: Date.now() })}\n`,
    );
  }

  debug(message: string, data?: unknown): void {
    this.write('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.write('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.write('error', message, data);
  }
}
