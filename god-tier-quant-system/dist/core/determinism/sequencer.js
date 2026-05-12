export class EventSequencer {
    constructor() {
        this.nextSequence = 1;
        this.lastAcceptedSequence = 0;
    }
    wrap(payload, snapshotId, source, timestamp = Date.now()) {
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
    validateMonotonic(envelope) {
        if (!Number.isInteger(envelope.sequence) || envelope.sequence <= this.lastAcceptedSequence) {
            return false;
        }
        this.lastAcceptedSequence = envelope.sequence;
        return true;
    }
    currentSequence() {
        return this.lastAcceptedSequence;
    }
    peekNextSequence() {
        return this.nextSequence;
    }
    reset(sequence = 0) {
        this.lastAcceptedSequence = Math.max(0, Math.floor(sequence));
        this.nextSequence = this.lastAcceptedSequence + 1;
    }
}
