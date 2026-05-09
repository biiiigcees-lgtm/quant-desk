import { EVENTS } from '../core/index.js';
import { EventStreamServer } from './websocket-server.js';
import { RestServer } from './rest-server.js';
export class ApiService {
    constructor(eventBus, logger, host, port) {
        this.latestSignal = null;
        this.latestPortfolio = null;
        this.latestOrders = [];
        this.latestPositions = [];
        this.eventBus = eventBus;
        this.logger = logger;
        this.streamServer = new EventStreamServer();
        this.restServer = new RestServer(host, port, {
            getPortfolio: () => this.latestPortfolio,
            getOrders: () => this.latestOrders,
            getPositions: () => this.latestPositions,
            getLatestSignal: () => this.latestSignal,
        }, this.streamServer);
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
    async start() {
        this.eventBus.on(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
        this.eventBus.on(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
        this.eventBus.on(EVENTS.ORDER_FILLED, this.orderFilledListener);
        await this.restServer.start();
        this.logger.info('API service started');
    }
    async stop() {
        this.eventBus.off(EVENTS.AGGREGATED_SIGNAL, this.signalListener);
        this.eventBus.off(EVENTS.PORTFOLIO_UPDATE, this.portfolioListener);
        this.eventBus.off(EVENTS.ORDER_FILLED, this.orderFilledListener);
        await this.restServer.stop();
    }
}
