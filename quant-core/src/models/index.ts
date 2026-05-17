export { bayesianFusion, updatePrior, computeLikelihoodRatio, classifySignal } from './bayesian';
export type { Signals, BayesianOutput } from './bayesian';

export { KalmanFilter, MultiStateKalmanFilter, detectTrendChange, computeKalmanVelocity } from './kalman';

export { liquidityField, computeLiquidityStress, estimateSlippage, detectLiquidityCrisis, computeLiquidityScore } from './liquidity';
export type { LiquidityPressure } from './liquidity';

export { reconstructMicrostructure, classifyTradeFlow } from './microstructure';
export type { MicrostructureFeatures } from './microstructure';

export { noiseFilter, detectSpoofing, detectWashTrading, applyNoiseDiscount } from './noise-filter';
export type { NoiseMetrics } from './noise-filter';

export { HiddenMarkovModel, detectRegime, updateTransitionMatrix } from './regime';
export type { HMMState } from './regime';

export { TradingAgent, ExperienceReplayBuffer } from './decision-agent';
export type { State, Action } from './decision-agent';