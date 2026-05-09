export class BaseError extends Error {
    constructor(message, code, statusCode = 500, context) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.context = context;
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, BaseError.prototype);
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            context: this.context,
        };
    }
}
export class TradeError extends BaseError {
    constructor(message, context) {
        super(message, 'TRADE_ERROR', 400, context);
        Object.setPrototypeOf(this, TradeError.prototype);
    }
}
export class RiskError extends BaseError {
    constructor(message, context) {
        super(message, 'RISK_ERROR', 403, context);
        Object.setPrototypeOf(this, RiskError.prototype);
    }
}
export class ExecutionError extends BaseError {
    constructor(message, context) {
        super(message, 'EXECUTION_ERROR', 500, context);
        Object.setPrototypeOf(this, ExecutionError.prototype);
    }
}
export class ValidationError extends BaseError {
    constructor(message, context) {
        super(message, 'VALIDATION_ERROR', 400, context);
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}
export class ConfigError extends BaseError {
    constructor(message, context) {
        super(message, 'CONFIG_ERROR', 400, context);
        Object.setPrototypeOf(this, ConfigError.prototype);
    }
}
