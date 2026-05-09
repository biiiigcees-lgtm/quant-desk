import http from 'node:http';
import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';

export class ApiServer {
  private server: http.Server | null = null;
  private readonly latest: Record<string, unknown> = {};
  private readonly orchestrationMetrics: unknown[] = [];

  constructor(private readonly bus: EventBus, private readonly host: string, private readonly port: number) {}

  start(): Promise<void> {
    this.bus.on(EVENTS.PROBABILITY, (event) => {
      this.latest.probability = event;
    });
    this.bus.on(EVENTS.AGGREGATED_SIGNAL, (event) => {
      this.latest.signal = event;
    });
    this.bus.on(EVENTS.EXECUTION_CONTROL, (event) => {
      this.latest.executionControl = event;
    });
    this.bus.on(EVENTS.EXECUTION_STATE, (event) => {
      this.latest.executionState = event;
    });
    this.bus.on(EVENTS.CALIBRATION_UPDATE, (event) => {
      this.latest.calibration = event;
    });
    this.bus.on(EVENTS.DRIFT_EVENT, (event) => {
      this.latest.drift = event;
    });
    this.bus.on(EVENTS.VALIDATION_RESULT, (event) => {
      this.latest.validation = event;
    });
    this.bus.on(EVENTS.PORTFOLIO_UPDATE, (event) => {
      this.latest.portfolio = event;
    });
    this.bus.on(EVENTS.ANOMALY, (event) => {
      this.latest.anomaly = event;
    });
    this.bus.on(EVENTS.AI_AGGREGATED_INTELLIGENCE, (event) => {
      this.latest.aiAggregatedIntelligence = event;
    });
    this.bus.on(EVENTS.AI_ORCHESTRATION_METRICS, (event) => {
      this.orchestrationMetrics.unshift(event);
      if (this.orchestrationMetrics.length > 100) {
        this.orchestrationMetrics.pop();
      }
      this.latest.aiOrchestrationMetrics = this.orchestrationMetrics;
    });

    this.server = http.createServer((req, res) => {
      const path = req.url ?? '/';
      if (path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ts: Date.now() }));
        return;
      }

      if (path === '/state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.latest));
        return;
      }

      if (path === '/execution') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            executionState: this.latest.executionState ?? null,
            executionControl: this.latest.executionControl ?? null,
            calibration: this.latest.calibration ?? null,
            drift: this.latest.drift ?? null,
            validation: this.latest.validation ?? null,
            aiAggregatedIntelligence: this.latest.aiAggregatedIntelligence ?? null,
          }),
        );
        return;
      }

      if (path === '/orchestration') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            aiAggregatedIntelligence: this.latest.aiAggregatedIntelligence ?? null,
            aiOrchestrationMetrics: this.latest.aiOrchestrationMetrics ?? [],
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });

    return new Promise((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.port, this.host, () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }
}
