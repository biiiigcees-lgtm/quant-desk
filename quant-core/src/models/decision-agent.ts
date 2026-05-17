import { DecisionType } from '../schemas';
import { Matrix } from 'ml-matrix';

// Lightweight neural network using ml-matrix (no TensorFlow dependency)
class DenseLayer {
  private weights: Matrix;
  private bias: Matrix;
  private activation: 'relu' | 'linear';

  constructor(inputSize: number, outputSize: number, activation: 'relu' | 'linear') {
    // Xavier initialization
    const scale = Math.sqrt(2.0 / (inputSize + outputSize));
    const data: number[][] = [];
    for (let i = 0; i < outputSize; i++) {
      const row: number[] = [];
      for (let j = 0; j < inputSize; j++) {
        row.push((Math.random() * 2 - 1) * scale);
      }
      data.push(row);
    }
    this.weights = new Matrix(data);
    this.bias = new Matrix(outputSize, 1);
    this.activation = activation;
  }

  forward(input: Matrix): Matrix {
    const z = this.weights.mmul(input).add(this.bias);
    if (this.activation === 'relu') {
      // Manual ReLU since Matrix.map() may not exist in all versions
      const rows = z.to2DArray();
      const reluRows = rows.map(row => row.map(v => Math.max(0, v)));
      return new Matrix(reluRows);
    }
    return z; // linear
  }

  getWeights(): Matrix { return this.weights; }
  getBias(): Matrix { return this.bias; }

  setWeights(w: Matrix): void { this.weights = w; }
  setBias(b: Matrix): void { this.bias = b; }
}

export interface State {
  probabilityLong: number;
  probabilityShort: number;
  volatility: number;
  noiseScore: number;
  regimeIndex: number;
  liquidityPressure: number;
  kalmanDeviation: number;
}

export interface Action {
  type: DecisionType;
  confidence: number;
}

export class TradingAgent {
  private layer1: DenseLayer;
  private layer2: DenseLayer;
  private layer3: DenseLayer;
  private outputLayer: DenseLayer;
  private readonly actionSize: number = 3; // LONG, SHORT, HOLD
  private readonly gamma: number = 0.99;
  private epsilon: number = 0.1;

  constructor(stateSize: number = 7) {
    this.layer1 = new DenseLayer(stateSize, 64, 'relu');
    this.layer2 = new DenseLayer(64, 128, 'relu');
    this.layer3 = new DenseLayer(128, 64, 'relu');
    this.outputLayer = new DenseLayer(64, this.actionSize, 'linear');
  }

  stateToVector(state: State): number[] {
    return [
      state.probabilityLong,
      state.probabilityShort,
      state.volatility,
      state.noiseScore,
      state.regimeIndex,
      state.liquidityPressure,
      state.kalmanDeviation,
    ];
  }

  predict(state: State): Action {
    // Epsilon-greedy exploration
    if (Math.random() < this.epsilon) {
      return this.randomAction();
    }

    const qValues = this.forwardPass(state);
    const actionIndex = this.argmax(qValues);

    const actionType = this.indexToAction(actionIndex);
    // Normalize confidence from Q-values
    const maxQ = Math.max(...qValues);
    const minQ = Math.min(...qValues);
    const range = maxQ - minQ || 1;
    const confidence = Math.min(1, Math.max(0.5, (maxQ - minQ) / range));

    return {
      type: actionType,
      confidence,
    };
  }

  private forwardPass(state: State): number[] {
    const input = new Matrix([this.stateToVector(state)]).transpose();
    const h1 = this.layer1.forward(input);
    const h2 = this.layer2.forward(h1);
    const h3 = this.layer3.forward(h2);
    const output = this.outputLayer.forward(h3);
    return output.to1DArray();
  }

  private randomAction(): Action {
    const actions: DecisionType[] = ['LONG', 'SHORT', 'HOLD'];
    const randomIndex = Math.floor(Math.random() * actions.length);
    return {
      type: actions[randomIndex],
      confidence: 0.5,
    };
  }

  private indexToAction(index: number): DecisionType {
    const actions: DecisionType[] = ['LONG', 'SHORT', 'HOLD'];
    return actions[index];
  }

  private argmax(array: number[]): number {
    let maxIndex = 0;
    let maxValue = array[0];
    for (let i = 1; i < array.length; i++) {
      if (array[i] > maxValue) {
        maxValue = array[i];
        maxIndex = i;
      }
    }
    return maxIndex;
  }

  train(
    states: State[],
    actions: Action[],
    rewards: number[],
    nextStates: State[],
    dones: boolean[]
  ): number {
    const batchSize = 32;
    let totalLoss = 0;
    const numBatches = Math.ceil(states.length / batchSize);

    for (let i = 0; i < numBatches; i++) {
      const startIdx = i * batchSize;
      const endIdx = Math.min(startIdx + batchSize, states.length);

      const batchStates = states.slice(startIdx, endIdx);
      const batchActions = actions.slice(startIdx, endIdx);
      const batchRewards = rewards.slice(startIdx, endIdx);
      const batchNextStates = nextStates.slice(startIdx, endIdx);
      const batchDones = dones.slice(startIdx, endIdx);

      // Compute targets with TD-learning
      for (let j = 0; j < batchStates.length; j++) {
        const currentQ = this.forwardPass(batchStates[j]);
        const nextQ = this.forwardPass(batchNextStates[j]);
        const actionIdx = this.actionToIndex(batchActions[j].type);

        let target: number;
        if (batchDones[j]) {
          target = batchRewards[j];
        } else {
          const maxNextQ = Math.max(...nextQ);
          target = batchRewards[j] + this.gamma * maxNextQ;
        }

        const error = target - currentQ[actionIdx];
        totalLoss += error * error;
      }
    }

    return totalLoss / numBatches;
  }

  private actionToIndex(action: DecisionType): number {
    const actions: DecisionType[] = ['LONG', 'SHORT', 'HOLD'];
    return actions.indexOf(action);
  }

  setEpsilon(value: number): void {
    this.epsilon = Math.max(0.01, Math.min(1, value));
  }

  getEpsilon(): number {
    return this.epsilon;
  }

  computeReward(
    action: Action,
    priceChange: number,
    holdingPeriod: number,
    riskPenalty: number = 0.001
  ): number {
    let reward = priceChange;

    if (holdingPeriod > 3600000) {
      reward -= riskPenalty * (holdingPeriod / 3600000);
    }

    reward *= action.confidence;

    if (action.type === 'HOLD' && Math.abs(priceChange) > 0.01) {
      reward -= 0.005;
    }

    return reward;
  }
}

export class ExperienceReplayBuffer {
  private buffer: {
    state: State;
    action: Action;
    reward: number;
    nextState: State;
    done: boolean;
  }[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  add(
    state: State,
    action: Action,
    reward: number,
    nextState: State,
    done: boolean
  ): void {
    this.buffer.push({ state, action, reward, nextState, done });

    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  sample(batchSize: number): {
    states: State[];
    actions: Action[];
    rewards: number[];
    nextStates: State[];
    dones: boolean[];
  } {
    const indices = this.getRandomIndices(batchSize);

    return {
      states: indices.map(i => this.buffer[i].state),
      actions: indices.map(i => this.buffer[i].action),
      rewards: indices.map(i => this.buffer[i].reward),
      nextStates: indices.map(i => this.buffer[i].nextState),
      dones: indices.map(i => this.buffer[i].done),
    };
  }

  private getRandomIndices(count: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i < count; i++) {
      indices.push(Math.floor(Math.random() * this.buffer.length));
    }
    return indices;
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}