import {
  EventBus,
  EVENTS,
  Logger,
  MarketUpdate,
  Order,
  PortfolioState,
} from '../../core/index.js';
import { createPositionFromOrder, markToMarket, shouldClosePosition } from './position-lifecycle.js';
import { PositionStore } from './position-store.js';

export class PositionEngineService {
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly store: PositionStore;
  private readonly orderListener: (order: Order) => void;
  private readonly marketListener: (update: MarketUpdate) => void;

  constructor(eventBus: EventBus, logger: Logger, initialBank: number) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.store = new PositionStore(initialBank);
    this.orderListener = (order) => this.handleOrderFilled(order);
    this.marketListener = (update) => this.handleMarketUpdate(update);
  }

  start(): void {
    this.eventBus.on(EVENTS.ORDER_FILLED, this.orderListener);
    this.eventBus.on(EVENTS.MARKET_UPDATE, this.marketListener);
    this.logger.info('Position engine service started');
  }

  stop(): void {
    this.eventBus.off(EVENTS.ORDER_FILLED, this.orderListener);
    this.eventBus.off(EVENTS.MARKET_UPDATE, this.marketListener);
  }

  getPortfolioState(): PortfolioState {
    return this.store.getPortfolio();
  }

  private handleOrderFilled(order: Order): void {
    this.store.upsertOrder(order);

    const position = createPositionFromOrder(order);
    this.store.addPosition(position);

    this.eventBus.emit(EVENTS.POSITION_OPENED, position);
    this.eventBus.emit(EVENTS.PORTFOLIO_UPDATE, this.store.getPortfolio());
  }

  private handleMarketUpdate(update: MarketUpdate): void {
    const portfolio = this.store.getPortfolio();

    let exposure = 0;
    for (const position of portfolio.positions) {
      if (position.status !== 'open') {
        continue;
      }

      if (position.contractId !== update.contractId) {
        exposure += position.size;
        continue;
      }

      const mtm = markToMarket(position, update.yesPrice);
      this.store.updatePosition(position.positionId, {
        currentPrice: mtm.currentPrice,
        currentPnL: mtm.currentPnL,
      });

      if (shouldClosePosition(mtm, update.timestamp)) {
        this.store.updatePosition(position.positionId, { status: 'closed' });
        this.store.applyRealizedPnl(mtm.currentPnL);
        this.eventBus.emit(EVENTS.POSITION_CLOSED, {
          ...mtm,
          status: 'closed',
        });
      } else {
        exposure += mtm.size;
      }
    }

    this.store.setExposure(exposure);
    this.eventBus.emit(EVENTS.PORTFOLIO_UPDATE, this.store.getPortfolio());
  }
}
