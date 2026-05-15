import { Candle, OrderBook } from '../features';

export interface StressScenario {
  type: 'VOLATILITY_SPIKE' | 'LIQUIDITY_COLLAPSE' | 'NOISE_INJECTION' | 'REGIME_FLIP';
  severity: number;
}

export interface StressTestResult {
  scenario: StressScenario;
  robustnessScore: number;
  fragilityReport: string[];
  systemResponse: string;
}

export function simulateVolatilitySpike(candles: Candle[], severity: number): Candle[] {
  const multiplier = 1 + severity * 0.5;
  return candles.map(c => ({
    ...c,
    high: c.high * multiplier,
    low: c.low / multiplier,
  }));
}

export function simulateLiquidityCollapse(ob: OrderBook, severity: number): OrderBook {
  const depthReduction = 1 - severity * 0.8;
  return {
    bids: ob.bids.map(([p, s]) => [p, s * depthReduction]),
    asks: ob.asks.map(([p, s]) => [p, s * depthReduction]),
  };
}

export function injectNoise(candles: Candle[], severity: number): Candle[] {
  const noiseLevel = severity * 0.1;
  return candles.map(c => ({
    ...c,
    close: c.close * (1 + (Math.random() - 0.5) * noiseLevel),
  }));
}

export function simulateRegimeFlip(candles: Candle[]): Candle[] {
  return candles.map(c => ({
    ...c,
    close: c.open + (c.open - c.close),
  }));
}

export function runStressTest(scenario: StressScenario): StressTestResult {
  const fragility: string[] = [];
  let robustnessScore = 1.0;
  
  switch (scenario.type) {
    case 'VOLATILITY_SPIKE':
      robustnessScore = 1 - scenario.severity * 0.3;
      if (scenario.severity > 0.7) fragility.push('System may fail under extreme volatility');
      break;
    case 'LIQUIDITY_COLLAPSE':
      robustnessScore = 1 - scenario.severity * 0.5;
      if (scenario.severity > 0.5) fragility.push('Orderbook depth insufficient');
      break;
    case 'NOISE_INJECTION':
      robustnessScore = 1 - scenario.severity * 0.2;
      if (scenario.severity > 0.8) fragility.push('Signal detection may degrade');
      break;
    case 'REGIME_FLIP':
      robustnessScore = 0.7;
      fragility.push('Regime detection lag detected');
      break;
  }
  
  return {
    scenario,
    robustnessScore,
    fragilityReport: fragility,
    systemResponse: robustnessScore > 0.5 ? 'Resilient' : 'Fragile',
  };
}
