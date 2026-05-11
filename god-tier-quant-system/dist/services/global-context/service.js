import { EVENTS } from '../../core/event-bus/events.js';
export class GlobalContextService {
    constructor(bus) {
        this.bus = bus;
        this.stressByContract = new Map();
    }
    start() {
        this.bus.on(EVENTS.MARKET_DATA, (event) => {
            const stress = Math.min(1, Math.max(0, event.spread * 25 + Math.abs(event.yesPrice - 0.5)));
            this.stressByContract.set(event.contractId, stress);
            const avgStress = this.stressByContract.size === 0
                ? 0
                : Array.from(this.stressByContract.values()).reduce((acc, v) => acc + v, 0) /
                    this.stressByContract.size;
            let marketRegime;
            let liquidity;
            if (avgStress > 0.75) {
                marketRegime = 'risk-off';
                liquidity = 'thin';
            }
            else if (avgStress < 0.35) {
                marketRegime = 'risk-on';
                liquidity = 'abundant';
            }
            else {
                marketRegime = 'neutral';
                liquidity = 'normal';
            }
            const context = {
                marketRegime,
                liquidity,
                stressIndex: Number(avgStress.toFixed(4)),
                timestamp: event.timestamp,
            };
            this.bus.emit(EVENTS.GLOBAL_CONTEXT, context);
        });
    }
}
