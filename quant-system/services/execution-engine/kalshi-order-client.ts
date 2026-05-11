import { Logger, Order } from '../../core/index.js';

export interface PlaceOrderInput {
  contractId: string;
  side: 'YES' | 'NO';
  size: number;
  price: number;
  clientOrderId: string;
}

export class KalshiOrderClient {
  private readonly simulationMode: boolean;
  private readonly logger: Logger;

  constructor(simulationMode: boolean, logger: Logger) {
    this.simulationMode = simulationMode;
    this.logger = logger;
  }

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    if (this.simulationMode) {
      const filled: Order = {
        clientOrderId: input.clientOrderId,
        contractId: input.contractId,
        side: input.side,
        size: input.size,
        price: input.price,
        status: 'filled',
        filledSize: input.size,
        fills: [
          {
            size: input.size,
            price: input.price,
            timestamp: Date.now(),
          },
        ],
        createdAt: Date.now(),
        filledAt: Date.now(),
      };

      this.logger.debug('Simulated order fill', filled);
      return filled;
    }

    throw new Error('Live order placement not implemented yet');
  }
}
