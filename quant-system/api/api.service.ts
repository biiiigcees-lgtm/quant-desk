import { AggregatedSignal, EventBus, EVENTS, Logger, PortfolioState } from '../core/index.js';
import { Order } from '../core/index.js';
import { Position } from '../core/index.js';
import { EventStreamServer } from './websocket-server.js';
import { RestServer } from './rest-server.js';

export class ApiService {
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly streamServer: EventStreamServer;
  private readonly restServer: RestServer;

  private latestSignal: AggregatedSignal | null = null;
  private latestPortfolio: PortfolioState | null = null;
  private latestOrders: Order[] = [];
  private latestPositions: Position[] = [];

  private readonly signalListener: (signal: AggregatedSignal) => void;
  private readonly portfolioListener: (portfolio: PortfolioState) => void;
  private readonly orderFilledListener: (order: Order) => void;

  constructor(eventBus: EventBus, logger: Logger, host: string, port: number) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.streamServer = new EventStreamServer();

    this.restServer = new RestServer(
      host,
      port,
      {
        getPortfolio: () => this.latestPortfolio,
        getOrders: () => this.latestOrders,
        getPositions: () => this.latestPositions,
        getLatestSignal: () => this.latestSignal,
      },
      this.streamServer,
    );

    this.signalListener = (signal) => {
      this.latestSignal = signal;
      this.streamServer.broadcast('signal', signal);
    };

    this.portfolioListener = (portfolio) => {
      this.latestPortfolio = portfolio;
      this.latestPositions = portfolio.positions;
      this.latestOrders = portfolio.orders;
      this.streamServer.broadcast('portfolio', portfolio);
    };

    this.orderFilledListener = (order) => {
      this.latestOrders = [...this.latestOrders.filter((o) => o.clientOrderId !== order.clientOrderId), order];
      this.streamServer.broadcast('order', order);
    };
  }

  async start(): Promise<void> {
    this.eventBus.on(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
    this.eventBus.on(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
    this.eventBus.on(EVENTS.ORDER_FILLED, this.orderFilledListener);

    await this.restServer.start();
    this.logger.info('API service started');
  }

  async stop(): Promise<void> {
    this.eventBus.off(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
    this.eventBus.off(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
    this.eventBus.off(EVENTS.ORDER_FILLED, this.orderFilledListener);

    await this.restServer.stop();
  }
}
