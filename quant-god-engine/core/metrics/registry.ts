import { TelemetryEvent } from '../schemas/events.js';

export class MetricsRegistry {
  private readonly series: Map<string, number[]> = new Map();

  record(event: TelemetryEvent): void {
    const values = this.series.get(event.name) ?? [];
    values.push(event.value);
    if (values.length > 5000) {
      values.shift();
    }
    this.series.set(event.name, values);
  }

  latest(name: string): number | null {
    const values = this.series.get(name);
    if (!values || values.length === 0) {
      return null;
    }
    return values.at(-1) ?? null;
  }

  mean(name: string): number | null {
    const values = this.series.get(name);
    if (!values || values.length === 0) {
      return null;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}
