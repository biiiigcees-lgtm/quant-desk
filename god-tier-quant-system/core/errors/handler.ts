interface TelemetryBus {
  emit: (event: string, payload: unknown) => void;
}

let installedBus: TelemetryBus | null = null;

/**
 * Install an EventBus-compatible bus to receive structured error telemetry.
 * Must be called before errors occur to ensure they are captured.
 */
export function installErrorTelemetryBus(bus: TelemetryBus): void {
  installedBus = bus;
}

export function safeHandler<T>(
  fn: (event: T) => void,
  context: string,
): (event: T) => void {
  return (event: T) => {
    try {
      fn(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? (err.stack ?? '') : '';
      const ts = Date.now();

      // Structured stderr line — one JSON object, no pretty-print
      try {
        process.stderr.write(
          JSON.stringify({ level: 'error', context, message, ts }) + '\n',
        );
      } catch {
        // double-fault protection
      }

      // Telemetry bus emission (if installed)
      if (installedBus !== null) {
        try {
          installedBus.emit('telemetry', { level: 'error', context, message, stack, timestamp: ts });
        } catch {
          // double-fault protection
        }
      }
    }
  };
}
