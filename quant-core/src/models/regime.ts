import { MarketContext, RegimeType } from '../schemas';

export interface HMMState {
  state: RegimeType;
  probability: number;
  transitionMatrix: number[][];
}

export class HiddenMarkovModel {
  private nStates: number;
  private transitionMatrix: number[][];
  private emissionMeans: number[];
  private emissionCovs: number[];
  private initialProbabilities: number[];

  constructor(nStates: number) {
    this.nStates = nStates;
    this.transitionMatrix = this.initializeTransitionMatrix(nStates);
    this.emissionMeans = new Array(nStates).fill(0);
    this.emissionCovs = new Array(nStates).fill(1);
    this.initialProbabilities = new Array(nStates).fill(1 / nStates);
  }

  private initializeTransitionMatrix(n: number): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(n).fill(1 / n);
      matrix.push(row);
    }
    return matrix;
  }

  train(observations: number[][], maxIterations: number = 100): void {
    // Simplified EM algorithm for HMM training
    // In production, use proper HMM library (hmm-js or similar)
    for (let iter = 0; iter < maxIterations; iter++) {
      this.emStep(observations);
    }
  }

  private emStep(observations: number[][]): void {
    // Simplified E-step and M-step
    // Update emission means based on observations
    for (let s = 0; s < this.nStates; s++) {
      const stateObs = observations.map(obs => obs[0]); // Use first feature
      this.emissionMeans[s] = stateObs.reduce((a, b) => a + b, 0) / stateObs.length;
    }
  }

  forward(observation: number[]): number[] {
    // Forward algorithm to compute state probabilities
    const alpha = new Array(this.nStates).fill(0);
    
    for (let s = 0; s < this.nStates; s++) {
      alpha[s] = this.initialProbabilities[s] * this.emissionProbability(observation, s);
    }

    const sum = alpha.reduce((a, b) => a + b, 0);
    return alpha.map(p => p / sum);
  }

  private emissionProbability(observation: number[], state: number): number {
    // Gaussian emission probability
    const mean = this.emissionMeans[state];
    const cov = this.emissionCovs[state];
    const x = observation[0];
    
    const diff = x - mean;
    const exponent = -0.5 * (diff * diff) / cov;
    return Math.exp(exponent);
  }

  viterbi(observations: number[][]): RegimeType[] {
    // Viterbi algorithm for most likely state sequence
    const regimes: RegimeType[] = ['CHOPPY', 'TRENDING_UP', 'TRENDING_DOWN', 'LIQUIDATION_DRIVEN', 'HIGH_VOL'];
    const path: number[] = [];
    
    for (const obs of observations) {
      const probs = this.forward(obs);
      const maxState = probs.indexOf(Math.max(...probs));
      path.push(maxState);
    }

    return path.map(s => regimes[s]);
  }
}

export function detectRegime(ctx: MarketContext, hmm: HiddenMarkovModel): RegimeType {
  const regimes: RegimeType[] = ['CHOPPY', 'TRENDING_UP', 'TRENDING_DOWN', 'LIQUIDATION_DRIVEN', 'HIGH_VOL'];
  
  // Convert context to observation vector
  const obs = [
    ctx.price / 10000, // Normalize price
    ctx.volatility,
    ctx.openInterest || 0,
    ctx.fundingRate || 0,
    ctx.liquidationLong - ctx.liquidationShort,
  ];

  const stateProbs = hmm.forward(obs);
  const maxState = stateProbs.indexOf(Math.max(...stateProbs));
  
  return regimes[maxState];
}

export function updateTransitionMatrix(hmm: HiddenMarkovModel, covariate: number): void {
  // Time-varying transition matrix based on exogenous covariate
  const n = hmm['nStates'];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      hmm['transitionMatrix'][i][j] *= (1 + covariate * 0.1);
    }
  }
  
  // Renormalize rows
  for (let i = 0; i < n; i++) {
    const rowSum = hmm['transitionMatrix'][i].reduce((a: number, b: number) => a + b, 0);
    hmm['transitionMatrix'][i] = hmm['transitionMatrix'][i].map((p: number) => p / rowSum);
  }
}
