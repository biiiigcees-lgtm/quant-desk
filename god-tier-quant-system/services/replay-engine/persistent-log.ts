import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { ReplayStorage } from '../../core/replay/storage.js';

type Listener = (payload: unknown) => void;

export interface PersistentEventLogOptions {
  persistedEvents?: string[];
}

export class PersistentEventLog {
  private readonly listeners = new Map<string, Listener>();
  private readonly persistedEvents: string[];
  private hydrating = false;

  constructor(
    private readonly bus: EventBus,
    private readonly storage: ReplayStorage,
    options: PersistentEventLogOptions = {},
  ) {
    this.persistedEvents = options.persistedEvents ?? DEFAULT_PERSISTED_EVENTS;
  }

  async hydrateBus(): Promise<number> {
    this.hydrating = true;
    try {
      return await this.storage.replay((record) => {
        this.bus.emit(record.event, record.payload, {
          timestamp: record.timestamp,
          snapshotId: record.snapshotId,
          source: record.source ?? record.event,
          idempotencyKey: record.idempotencyKey,
        });
      });
    } finally {
      this.hydrating = false;
    }
  }

  start(): void {
    for (const event of this.persistedEvents) {
      if (this.listeners.has(event)) {
        continue;
      }

      const listener: Listener = (payload) => {
        if (this.hydrating) {
          return;
        }

        this.storage.append(event, payload, {
          contractId: extractContractId(payload),
          snapshotId: extractSnapshotId(payload),
          source: extractSource(payload) ?? event,
          idempotencyKey: extractIdempotencyKey(payload),
          timestamp: extractTimestamp(payload),
        });
      };

      this.listeners.set(event, listener);
      this.bus.on(event, listener);
    }
  }

  stop(): void {
    for (const [event, listener] of this.listeners.entries()) {
      this.bus.off(event, listener);
    }
    this.listeners.clear();
  }
}

const DEFAULT_PERSISTED_EVENTS = Object.values(EVENTS).filter((event) => event !== EVENTS.REPLAY_EVENT && event !== EVENTS.TELEMETRY);

function extractContractId(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'contractId' in payload) {
    const value = (payload as { contractId?: unknown }).contractId;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function extractSnapshotId(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'snapshotId' in payload) {
    const value = (payload as { snapshotId?: unknown }).snapshotId;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function extractSource(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'source' in payload) {
    const value = (payload as { source?: unknown }).source;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function extractIdempotencyKey(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'idempotencyKey' in payload) {
    const value = (payload as { idempotencyKey?: unknown }).idempotencyKey;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function extractTimestamp(payload: unknown): number | undefined {
  if (payload && typeof payload === 'object' && 'timestamp' in payload) {
    const value = (payload as { timestamp?: unknown }).timestamp;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}
