import { RegimeType } from '../schemas';

export interface Signals {
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  liquidityStress: 'SHORT_PRESSURE' | 'LONG_PRESSURE' | 'NONE';
  volatility: 'LOW' | 'MID' | 'HIGH';
  microstructure: 'STRONG_BUYING' | 'STRONG_SELLING' | 'BALANCED';
}

export interface BayesianOutput {
  probabilityLong: number;
  probabilityShort: number;
  confidence: number;
  regime: RegimeType;
}

export function bayesianFusion(
  signals: Signals,
  regime: RegimeType,
  prior: number = 0.5
): BayesianOutput {
  let posterior = prior;

  // Momentum signal likelihood
  if (signals.momentum === 'BULLISH') {
    posterior *= 1.3;
  } else if (signals.momentum === 'BEARISH') {
    posterior *= 0.7;
  }

  // Liquidity stress signal
  if (signals.liquidityStress === 'SHORT_PRESSURE') {
    posterior *= 1.15;
  } else if (signals.liquidityStress === 'LONG_PRESSURE') {
    posterior *= 0.85;
  }

  // Volatility signal (high vol reduces confidence)
  if (signals.volatility === 'HIGH') {
    posterior *= 0.85;
  } else if (signals.volatility === 'LOW') {
    posterior *= 1.1;
  }

  // Microstructure signal
  if (signals.microstructure === 'STRONG_BUYING') {
    posterior *= 1.2;
  } else if (signals.microstructure === 'STRONG_SELLING') {
    posterior *= 0.8;
  }

  // Regime conditioning
  switch (regime) {
    case 'TRENDING_UP':
      posterior *= 1.25;
      break;
    case 'TRENDING_DOWN':
      posterior *= 0.75;
      break;
    case 'LIQUIDATION_DRIVEN':
      // Liquidation-driven regimes are more volatile
      posterior *= 0.9;
      break;
    case 'HIGH_VOL':
      posterior *= 0.85;
      break;
    case 'CHOPPY':
      // Choppy markets reduce conviction
      posterior *= 0.95;
      break;
  }

  // Normalize to [0, 1]
  const probabilityLong = Math.min(0.99, Math.max(0.01, posterior));
  const probabilityShort = 1 - probabilityLong;

  // Confidence based on distance from 0.5
  const confidence = Math.abs(probabilityLong - 0.5) * 2;

  return {
    probabilityLong,
    probabilityShort,
    confidence,
    regime,
  };
}

export function updatePrior(
  currentPrior: number,
  newEvidence: number,
  learningRate: number = 0.1
): number {
  // Bayesian prior update with learning rate
  const updatedPrior = currentPrior + learningRate * (newEvidence - currentPrior);
  return Math.min(0.99, Math.max(0.01, updatedPrior));
}

export function computeLikelihoodRatio(
  probabilityLong: number,
  probabilityShort: number
): number {
  if (probabilityShort === 0) return Infinity;
  return probabilityLong / probabilityShort;
}

export function classifySignal(
  probabilityLong: number,
  confidence: number
): 'STRONG_LONG' | 'LONG' | 'NEUTRAL' | 'SHORT' | 'STRONG_SHORT' {
  if (confidence < 0.3) return 'NEUTRAL';
  
  if (probabilityLong > 0.7) {
    return confidence > 0.7 ? 'STRONG_LONG' : 'LONG';
  } else if (probabilityLong < 0.3) {
    return confidence > 0.7 ? 'STRONG_SHORT' : 'SHORT';
  }
  
  return 'NEUTRAL';
}
