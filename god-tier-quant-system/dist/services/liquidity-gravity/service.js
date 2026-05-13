import { EVENTS } from '../../core/event-bus/events.js';
import { safeHandler } from '../../core/errors/handler.js';
const WALL_SIZE_THRESHOLD = 250;
const MAX_WALLS = 5;
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
export class LiquidityGravityService {
    constructor(bus) {
        this.bus = bus;
        this.state = new Map();
    }
    start() {
        this.bus.on(EVENTS.MARKET_DATA, safeHandler((e) => {
            this.process(e);
        }, 'LiquidityGravity'));
    }
    process(e) {
        const midPrice = (e.yesPrice + e.noPrice) / 2;
        this.state.set(e.contractId, { midPrice });
        // Identify bid walls (large resting bids)
        const bidWalls = e.bidLevels
            .filter(([, size]) => size >= WALL_SIZE_THRESHOLD)
            .sort(([, a], [, b]) => b - a)
            .slice(0, MAX_WALLS)
            .map(([price, size]) => ({
            price,
            size,
            distance: midPrice - price,
        }));
        // Identify ask walls (large resting asks)
        const askWalls = e.askLevels
            .filter(([, size]) => size >= WALL_SIZE_THRESHOLD)
            .sort(([, a], [, b]) => b - a)
            .slice(0, MAX_WALLS)
            .map(([price, size]) => ({
            price,
            size,
            distance: price - midPrice,
        }));
        // Gravitational pull: bid walls attract price downward, ask walls attract upward
        // Each wall's gravity = size / distance² (inverse square law)
        let bidGravity = 0;
        let askGravity = 0;
        for (const wall of bidWalls) {
            const d = Math.max(0.001, wall.distance);
            bidGravity += wall.size / (d * d);
        }
        for (const wall of askWalls) {
            const d = Math.max(0.001, wall.distance);
            askGravity += wall.size / (d * d);
        }
        // gravitationalBias: +1 = price pulled up toward ask wall, -1 = pulled down toward bid wall
        const totalGravity = bidGravity + askGravity;
        const gravitationalBias = totalGravity < 0.001
            ? 0
            : clamp((askGravity - bidGravity) / totalGravity, -1, 1);
        const nearestBidWallDistance = bidWalls.length > 0
            ? Math.min(...bidWalls.map(w => w.distance))
            : 1;
        const nearestAskWallDistance = askWalls.length > 0
            ? Math.min(...askWalls.map(w => w.distance))
            : 1;
        // Resistance zones: any wall is a resistance zone
        const resistanceZones = [
            ...bidWalls.map(w => ({ price: w.price, strength: clamp(w.size / 1000, 0, 1), side: 'bid' })),
            ...askWalls.map(w => ({ price: w.price, strength: clamp(w.size / 1000, 0, 1), side: 'ask' })),
        ];
        // Absorption strength: high when large walls are nearby and close to mid
        const nearbyBidAbsorption = bidWalls
            .filter(w => w.distance < 0.03)
            .reduce((s, w) => s + w.size, 0);
        const nearbyAskAbsorption = askWalls
            .filter(w => w.distance < 0.03)
            .reduce((s, w) => s + w.size, 0);
        const absorptionStrength = clamp((nearbyBidAbsorption + nearbyAskAbsorption) / 2000, 0, 1);
        const event = {
            contractId: e.contractId,
            bidWalls,
            askWalls,
            gravitationalBias,
            nearestBidWallDistance: clamp(nearestBidWallDistance, 0, 1),
            nearestAskWallDistance: clamp(nearestAskWallDistance, 0, 1),
            resistanceZones,
            absorptionStrength,
            timestamp: e.timestamp,
        };
        this.bus.emit(EVENTS.LIQUIDITY_GRAVITY, event);
    }
}
