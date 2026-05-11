import { appendFileSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
// ---------------------------------------------------------------------------
// ReplayStorage — append-only, sequenced event log
// ---------------------------------------------------------------------------
export class ReplayStorage {
    constructor(path, options = {}) {
        this.sequence = 0;
        this.path = path;
        this.maxFileSizeBytes = options.maxFileSizeBytes ?? 256 * 1024 * 1024; // 256 MB default
    }
    /**
     * Append an event to the log.
     * Returns the record that was written (or would have been written on disk failure).
     * Never throws.
     */
    append(event, payload, meta = {}) {
        this.sequence += 1;
        const record = {
            sequence: this.sequence,
            event,
            contractId: meta.contractId,
            snapshotId: meta.snapshotId,
            payload,
            timestamp: Date.now(),
        };
        if (!this.isFileSizeExceeded()) {
            try {
                appendFileSync(this.path, JSON.stringify(record) + '\n');
            }
            catch {
                // Never propagate write failures — in-memory sequence still advances
            }
        }
        return record;
    }
    /** Read all records from disk in sequence order. */
    async readAll() {
        const records = [];
        if (!existsSync(this.path)) {
            return records;
        }
        try {
            const stream = createReadStream(this.path, { encoding: 'utf8' });
            const rl = createInterface({ input: stream, crlfDelay: Infinity });
            for await (const line of rl) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                try {
                    const record = JSON.parse(trimmed);
                    records.push(record);
                }
                catch {
                    // Skip malformed lines — log is corrupt or partially written
                }
            }
        }
        catch {
            // File unreadable
        }
        return records;
    }
    /**
     * Verify log integrity: checks for gaps and duplicates in sequence numbers.
     * Returns a full integrity report.
     */
    async verify() {
        const records = await this.readAll();
        const gaps = [];
        const duplicates = [];
        const seen = new Set();
        for (const record of records) {
            if (seen.has(record.sequence)) {
                duplicates.push(record.sequence);
            }
            seen.add(record.sequence);
        }
        // Find gaps in the sequence: sort and check for discontinuities
        const sorted = [...seen].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            if (prev !== undefined && curr !== undefined && curr !== prev + 1) {
                for (let missing = prev + 1; missing < curr; missing++) {
                    gaps.push(missing);
                }
            }
        }
        let sizeBytes = 0;
        try {
            if (existsSync(this.path)) {
                sizeBytes = statSync(this.path).size;
            }
        }
        catch {
            // Ignore stat errors
        }
        return {
            valid: gaps.length === 0 && duplicates.length === 0,
            count: records.length,
            gaps,
            duplicates,
            sizeBytes,
        };
    }
    /**
     * Replay events from the log, calling the handler for each in sequence order.
     * Skips malformed records silently. Returns the count of replayed events.
     */
    async replay(handler, options = {}) {
        const records = await this.readAll();
        const filtered = records
            .filter((r) => {
            if (options.fromSequence !== undefined && r.sequence < options.fromSequence)
                return false;
            if (options.toSequence !== undefined && r.sequence > options.toSequence)
                return false;
            return true;
        })
            .sort((a, b) => a.sequence - b.sequence);
        let count = 0;
        for (const record of filtered) {
            try {
                await handler(record);
                count++;
            }
            catch {
                // Handler errors are isolated — replay continues
            }
        }
        return count;
    }
    /** Current in-memory sequence counter (highest sequence appended this session). */
    currentSequence() {
        return this.sequence;
    }
    isFileSizeExceeded() {
        try {
            if (existsSync(this.path)) {
                return statSync(this.path).size >= this.maxFileSizeBytes;
            }
        }
        catch {
            // Ignore stat errors
        }
        return false;
    }
}
