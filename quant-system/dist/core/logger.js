export class Logger {
    constructor(minLevel = 'info') {
        this.levelOrder = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
        };
        this.minLevel = minLevel;
    }
    shouldLog(level) {
        return this.levelOrder[level] >= this.levelOrder[this.minLevel];
    }
    formatEntry(level, message, data) {
        return {
            level,
            timestamp: new Date().toISOString(),
            message,
            data,
        };
    }
    debug(message, data) {
        if (this.shouldLog('debug')) {
            const entry = this.formatEntry('debug', message, data);
            console.log(JSON.stringify(entry));
        }
    }
    info(message, data) {
        if (this.shouldLog('info')) {
            const entry = this.formatEntry('info', message, data);
            console.log(JSON.stringify(entry));
        }
    }
    warn(message, data) {
        if (this.shouldLog('warn')) {
            const entry = this.formatEntry('warn', message, data);
            console.warn(JSON.stringify(entry));
        }
    }
    error(message, data) {
        if (this.shouldLog('error')) {
            const entry = this.formatEntry('error', message, data);
            console.error(JSON.stringify(entry));
        }
    }
}
