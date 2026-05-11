import { Strategy } from '../strategy.base.js';
export class MomentumStrategy extends Strategy {
    constructor() {
        super('Momentum');
    }
    evaluate(featureVector) {
        const { ema3, ema9, ema21, rsi, macd, probVelocity, timestamp } = featureVector;
        const bullishTrend = ema3 > ema9 && ema9 > ema21;
        const bearishTrend = ema3 < ema9 && ema9 < ema21;
        const momentumUp = macd.histogram > 0 && probVelocity > 0;
        const momentumDown = macd.histogram < 0 && probVelocity < 0;
        let direction = 'FLAT';
        let confidence = 0.2;
        let reasoning = 'No clear momentum alignment';
        if (bullishTrend && momentumUp && rsi > 52 && rsi < 80) {
            direction = 'YES';
            confidence = 0.55 + Math.min(0.35, Math.abs(macd.histogram) * 8);
            reasoning = 'Bullish EMA stack with positive momentum';
        }
        else if (bearishTrend && momentumDown && rsi > 20 && rsi < 48) {
            direction = 'NO';
            confidence = 0.55 + Math.min(0.35, Math.abs(macd.histogram) * 8);
            reasoning = 'Bearish EMA stack with negative momentum';
        }
        const expectedValue = direction === 'FLAT' ? 0 : (confidence - 0.5) * (direction === 'YES' ? 1 : -1);
        return {
            strategyName: this.name,
            direction,
            confidence: this.clampConfidence(confidence),
            expectedValue,
            regime: 'trend',
            reasoning,
            timestamp,
        };
    }
}
