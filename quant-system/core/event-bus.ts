import { EventEmitter } from 'events';
import {
  MarketUpdate,
  FeatureVector,
  StrategySignal,
  AggregatedSignal,
  RiskDecision,
  Order,
  PortfolioState,
} from './types.js';

export const EVENTS = {
  // Market events
  MARKET_UPDATE: 'market:update',
  MARKET_CONNECT: 'market:connect',
  MARKET_DISCONNECT: 'market:disconnect',
  MARKET_ERROR: 'market:error',

  // Feature events
  FEATURE_VECTOR: 'feature:vector',
  FEATURE_ERROR: 'feature:error',

  // Strategy events
  STRATEGY_SIGNAL: 'strategy:signal',
  STRATEGY_ERROR: 'strategy:error',

  // Aggregation events
  AGGREGATED_SIGNAL: 'aggregation:signal',
  AGGREGATION_ERROR: 'aggregation:error',

  // Risk events
  RISK_DECISION: 'risk:decision',
  RISK_ERROR: 'risk:error',

  // Execution events
  ORDER_CREATED: 'order:created',
  ORDER_FILLED: 'order:filled',
  ORDER_REJECTED: 'order:rejected',
  EXECUTION_ERROR: 'execution:error',

  // Portfolio events
  PORTFOLIO_UPDATE: 'portfolio:update',
  POSITION_OPENED: 'position:opened',
  POSITION_CLOSED: 'position:closed',

  // Analyst events
  ANALYST_REPORT: 'analyst:report',

  // System events
  SYSTEM_READY: 'system:ready',
  SYSTEM_ERROR: 'system:error',
  SYSTEM_SHUTDOWN: 'system:shutdown',
} as const;

export type EventBusListener<T = any> = (data: T) => void | Promise<void>;

export class EventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
  }

  emit<T = any>(event: string, data: T): boolean {
    return this.emitter.emit(event, data);
  }

  on<T = any>(event: string, listener: EventBusListener<T>): this {
    this.emitter.on(event, listener);
    return this;
  }

  once<T = any>(event: string, listener: EventBusListener<T>): this {
    this.emitter.once(event, listener);
    return this;
  }

  off<T = any>(event: string, listener: EventBusListener<T>): this {
    this.emitter.off(event, listener);
    return this;
  }

  clear(event?: string): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  listenerCount(event: string): number {
    return this.emitter.listenerCount(event);
  }
}
