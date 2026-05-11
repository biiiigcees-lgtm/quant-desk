export class BaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: any,
  ) {
    super(message);
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
  constructor(message: string, context?: any) {
    super(message, 'TRADE_ERROR', 400, context);
    Object.setPrototypeOf(this, TradeError.prototype);
  }
}

export class RiskError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, 'RISK_ERROR', 403, context);
    Object.setPrototypeOf(this, RiskError.prototype);
  }
}

export class ExecutionError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, 'EXECUTION_ERROR', 500, context);
    Object.setPrototypeOf(this, ExecutionError.prototype);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, 'VALIDATION_ERROR', 400, context);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ConfigError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, 'CONFIG_ERROR', 400, context);
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}
