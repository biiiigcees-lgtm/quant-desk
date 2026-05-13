import { appendFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
// ---------------------------------------------------------------------------
// ReplayStorage — append-only, sequenced event log
// ---------------------------------------------------------------------------
export class ReplayStorage {
    constructor(path, options = {}) {
        this.sequence = 0;
        this.path = path;
        this.maxFileSizeBytes = options.maxFileSizeBytes ?? 256 * 1024 * 1024; // 256 MB default
        this.maxArchivedFiles = Math.max(1, options.maxArchivedFiles ?? 8);
        mkdirSync(dirname(this.path), { recursive: true });
        this.sequence = this.detectLastSequence();
    }
    /**
     * Append an event to the log.
     * Returns the record that was written (or would have been written on disk failure).
     * Never throws.
     */
    append(event, payload, meta = {}) {
        this.rotateIfNeeded();
        this.sequence += 1;
        const record = {
            sequence: this.sequence,
            event,
            contractId: meta.contractId,
            snapshotId: meta.snapshotId,
            source: meta.source,
            idempotencyKey: meta.idempotencyKey,
            payload,
            timestamp: meta.timestamp ?? Date.now(),
        };
        try {
            appendFileSync(this.path, JSON.stringify(record) + '\n');
        }
        catch {
            // Never propagate write failures — in-memory sequence still advances
        }
        return record;
    }
    /** Read all records from disk in sequence order. */
    async readAll() {
        const records = [];
        const logPaths = this.logPathsChronological();
        if (logPaths.length === 0) {
            return records;
        }
        for (const logPath of logPaths) {
            try {
                const stream = createReadStream(logPath, { encoding: 'utf8' });
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
        }
        records.sort((left, right) => left.sequence - right.sequence);
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
    detectLastSequence() {
        const logPaths = this.logPathsReverseChronological();
        if (logPaths.length === 0) {
            return 0;
        }
        for (const logPath of logPaths) {
            const seq = this.detectLastSequenceFromFile(logPath);
            if (seq > 0) {
                return seq;
            }
        }
        return 0;
    }
    detectLastSequenceFromFile(logPath) {
        const lines = this.readLogLines(logPath);
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            const line = lines[i]?.trim();
            if (!line) {
                continue;
            }
            const seq = parseSequence(line);
            if (seq > 0) {
                return seq;
            }
        }
        return 0;
    }
    readLogLines(logPath) {
        try {
            const content = readFileSync(logPath, 'utf8');
            return content.trim().split('\n');
        }
        catch {
            // Ignore read errors and continue scanning other log segments.
            return [];
        }
    }
    rotateIfNeeded() {
        if (!this.isFileSizeExceeded()) {
            return;
        }
        const archivePath = this.nextArchivePath();
        try {
            renameSync(this.path, archivePath);
        }
        catch {
            // Ignore rotation failures; append will attempt current file.
            return;
        }
        const archives = this.archivePathsChronological();
        const overflow = Math.max(0, archives.length - this.maxArchivedFiles);
        for (let i = 0; i < overflow; i += 1) {
            const stalePath = archives[i];
            if (!stalePath) {
                continue;
            }
            try {
                unlinkSync(stalePath);
            }
            catch {
                // Ignore cleanup errors.
            }
        }
    }
    archivePathsChronological() {
        const dir = dirname(this.path);
        const prefix = `${basename(this.path)}.`;
        const suffix = '.archive';
        let entries = [];
        try {
            entries = readdirSync(dir);
        }
        catch {
            return [];
        }
        return entries
            .filter((entry) => entry.startsWith(prefix) && entry.endsWith(suffix))
            .map((entry) => join(dir, entry))
            .sort((left, right) => {
            const leftTime = safeMtime(left);
            const rightTime = safeMtime(right);
            return leftTime - rightTime;
        });
    }
    logPathsChronological() {
        const archives = this.archivePathsChronological();
        if (existsSync(this.path)) {
            return [...archives, this.path];
        }
        return archives;
    }
    logPathsReverseChronological() {
        return this.logPathsChronological().reverse();
    }
    nextArchivePath() {
        const dir = dirname(this.path);
        const file = basename(this.path);
        const baseTs = Date.now();
        let candidate = join(dir, `${file}.${baseTs}.${this.sequence}.archive`);
        let counter = 1;
        while (existsSync(candidate)) {
            candidate = join(dir, `${file}.${baseTs}.${this.sequence}.${counter}.archive`);
            counter += 1;
        }
        return candidate;
    }
}
function safeMtime(path) {
    try {
        return statSync(path).mtimeMs;
    }
    catch {
        return 0;
    }
}
function parseSequence(line) {
    try {
        const parsed = JSON.parse(line);
        if (Number.isInteger(parsed.sequence) && Number(parsed.sequence) > 0) {
            return Number(parsed.sequence);
        }
    }
    catch {
        // Continue scanning backwards until a valid line is found.
    }
    return 0;
}
