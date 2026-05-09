export class KalshiOrderClient {
    constructor(simulationMode, logger) {
        this.simulationMode = simulationMode;
        this.logger = logger;
    }
    async placeOrder(input) {
        if (this.simulationMode) {
            const filled = {
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
