export class Logger {
    constructor(service) {
        this.service = service;
    }
    write(level, message, data) {
        process.stdout.write(`${JSON.stringify({ level, service: this.service, message, data, ts: Date.now() })}\n`);
    }
    debug(message, data) {
        this.write('debug', message, data);
    }
    info(message, data) {
        this.write('info', message, data);
    }
    warn(message, data) {
        this.write('warn', message, data);
    }
    error(message, data) {
        this.write('error', message, data);
    }
}
