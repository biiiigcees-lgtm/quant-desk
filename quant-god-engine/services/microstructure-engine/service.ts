import { EventBus } from '../../core/event-bus/bus.js';
import { EVENTS } from '../../core/event-bus/events.js';
import { Logger } from '../../core/telemetry/logger.js';
import { MarketDataEvent, MicrostructureEvent } from '../../core/schemas/events.js';

export class MicrostructureEngine {
  private readonly previousObi: Map<string, { obi: number; ts: number }> = new Map();

  constructor(private readonly bus: EventBus, private readonly logger: Logger) {}

  start(): void {
    this.bus.on<MarketDataEvent>(EVENTS.MARKET_DATA, (event) => {
      const output = this.compute(event);
      this.bus.emit(EVENTS.MICROSTRUCTURE, output);
    });
    this.logger.info('Microstructure engine started');
  }

  private compute(event: MarketDataEvent): MicrostructureEvent {
    const bidVolume = event.bidLevels.reduce((sum, [, size]) => sum + size, 0);
    const askVolume = event.askLevels.reduce((sum, [, size]) => sum + size, 0);
    const total = Math.max(1, bidVolume + askVolume);

    const obi = (bidVolume - askVolume) / total;
    const previous = this.previousObi.get(event.contractId);
    const dtSeconds = previous ? Math.max(0.001, (event.timestamp - previous.ts) / 1000) : 1;
    const obiVelocity = previous ? (obi - previous.obi) / dtSeconds : 0;
    this.previousObi.set(event.contractId, { obi, ts: event.timestamp });

    const spreadExpansionScore = Math.min(1, event.spread / 0.05);
    const liquidityPressureScore = Math.max(-1, Math.min(1, obi * 0.6 + obiVelocity * 0.4));
    const sweepProbability = Math.max(0, Math.min(1, Math.abs(obiVelocity) * 0.5 + spreadExpansionScore * 0.5));
    const panicRepricing = spreadExpansionScore > 0.7 && Math.abs(obiVelocity) > 0.4;

    const bestBid = event.bidLevels[0]?.[0] ?? event.yesPrice;
    const bestAsk = event.askLevels[0]?.[0] ?? event.yesPrice;
    const vacuum = bestAsk - bestBid > 0.03;
    let liquidityRegime: MicrostructureEvent['liquidityRegime'];
    if (vacuum) {
      liquidityRegime = 'vacuum';
    } else if (total < 180) {
      liquidityRegime = 'thin';
    } else {
      liquidityRegime = 'normal';
    }

    const aggressionScore = Math.max(0, Math.min(1, Math.abs(obiVelocity) + Math.abs(obi) * 0.5));

    return {
      contractId: event.contractId,
      obi,
      obiVelocity,
      liquidityPressureScore,
      spreadExpansionScore,
      sweepProbability,
      panicRepricing,
      liquidityRegime,
      aggressionScore,
      timestamp: event.timestamp,
    };
  }
}
