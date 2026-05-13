export interface EventEnvelope<T> {
  sequence: number;
  timestamp: number;
  snapshotId: string;
  source: string;
  lineageId: string;
  payload: T;
}

export class EventSequencer {
  private nextSequence = 1;
  private lastAcceptedSequence = 0;

  wrap<T>(
    payload: T,
    snapshotId: string,
    source: string,
    timestamp: number = Date.now(),
  ): EventEnvelope<T> {
    const sequence = this.nextSequence++;
    return {
      sequence,
      timestamp,
      snapshotId,
      source,
      lineageId: `${source}:${snapshotId}:${sequence}`,
      payload,
    };
  }

  validateMonotonic<T>(envelope: EventEnvelope<T>): boolean {
    if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.lastAcceptedSequence) {
      return false;
    }
    this.lastAcceptedSequence = envelope.sequence;
    return true;
  }

  currentSequence(): number {
    return this.lastAcceptedSequence;
  }

  peekNextSequence(): number {
    return this.nextSequence;
  }

  reset(sequence: number = 0): void {
    this.lastAcceptedSequence = Math.max(0, Math.floor(sequence));
    this.nextSequence = this.lastAcceptedSequence + 1;
  }
}
