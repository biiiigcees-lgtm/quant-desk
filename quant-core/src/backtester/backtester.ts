import { MarketContext, DecisionType, BacktestTrade, BacktestResults } from '../schemas';
import { TradingAgent, State, Action } from '../models/decision-agent';

export interface DataPoint {
  ctx: MarketContext;
  trades: any[];
  orderBook: any;
}

export interface BacktestConfig {
  initialCapital: number;
  positionSize: number;
  feeRate: number;
  slippage: number;
  maxPositionSize: number;
}

export class Backtester {
  private readonly agent: TradingAgent;
  private readonly config: BacktestConfig;
  private currentPosition: DecisionType;
  private entryPrice: number;
  private entryTime: number;
  private trades: BacktestTrade[] = [];

  constructor(agent: TradingAgent, config: BacktestConfig) {
    this.agent = agent;
    this.config = config;
    this.currentPosition = 'HOLD';
    this.entryPrice = 0;
    this.entryTime = 0;
  }

  async run(dataFeed: DataPoint[]): Promise<BacktestResults> {
    let totalPnL = 0;
    const attribution: Record<string, number> = {
      momentum: 0,
      liquidity: 0,
      volatility: 0,
      regime: 0,
      noise: 0,
    };

    for (let i = 0; i < dataFeed.length; i++) {
      const dataPoint = dataFeed[i];
      const ctx = dataPoint.ctx;

      // Extract features for agent
      const state: State = {
        probabilityLong: 0.5,
        probabilityShort: 0.5,
        volatility: ctx.volatility,
        noiseScore: 0,
        regimeIndex: 0,
        liquidityPressure: 0,
        kalmanDeviation: 0,
      };

      // Get decision from agent
      const action: Action = this.agent.predict(state);

      // Execute trade if action changes
      if (action.type !== this.currentPosition) {
        const pnl = this.executeTrade(action.type, ctx.price, ctx.timestamp);
        if (pnl !== null) {
          totalPnL += pnl;
          this.trades.push({
            timestamp: ctx.timestamp,
            symbol: ctx.symbol,
            action: action.type,
            entryPrice: this.entryPrice,
            exitPrice: ctx.price,
            quantity: this.config.positionSize,
            pnl,
            fees: this.calculateFees(this.config.positionSize, ctx.price),
            holdingPeriod: ctx.timestamp - this.entryTime,
          });

          // Attribution (simplified)
          attribution.momentum += pnl * 0.3;
          attribution.liquidity += pnl * 0.25;
          attribution.volatility += pnl * 0.2;
          attribution.regime += pnl * 0.15;
          attribution.noise += pnl * 0.1;
        }
      }

      // Update agent with reward
      const priceChange = i > 0 ? (ctx.price - dataFeed[i - 1].ctx.price) / dataFeed[i - 1].ctx.price : 0;
      this.agent.computeReward(action, priceChange, ctx.timestamp - this.entryTime);
      // In production, would add to replay buffer for training
    }

    const totalFees = this.trades.reduce((sum, t) => sum + t.fees, 0);
    const winRate = this.trades.filter(t => t.pnl && t.pnl > 0).length / this.trades.length;
    const maxDrawdown = this.calculateMaxDrawdown();

    return {
      symbol: dataFeed[0]?.ctx.symbol || 'UNKNOWN',
      startTime: dataFeed[0]?.ctx.timestamp || 0,
      endTime: dataFeed.at(-1)?.ctx.timestamp || 0,
      totalTrades: this.trades.length,
      totalPnL,
      totalFees,
      winRate,
      maxDrawdown,
      sharpeRatio: this.calculateSharpeRatio(totalPnL),
      trades: this.trades,
      attribution,
    };
  }

  private executeTrade(action: DecisionType, price: number, timestamp: number): number | null {
    if (this.currentPosition === 'HOLD') {
      // Opening position
      if (action === 'LONG' || action === 'SHORT') {
        this.currentPosition = action;
        this.entryPrice = price;
        this.entryTime = timestamp;
        return null;
      }
    } else {
      // Closing position
      const exitPrice = price;
      const quantity = this.config.positionSize;
      const fees = this.calculateFees(quantity, price);
      const slippage = this.calculateSlippage(quantity, price);

      let pnl: number;
      if (this.currentPosition === 'LONG') {
        pnl = (exitPrice - this.entryPrice) * quantity - fees - slippage;
      } else {
        pnl = (this.entryPrice - exitPrice) * quantity - fees - slippage;
      }

      this.currentPosition = 'HOLD';
      this.entryPrice = 0;
      this.entryTime = 0;

      return pnl;
    }

    return null;
  }

  private calculateFees(quantity: number, price: number): number {
    return quantity * price * this.config.feeRate;
  }

  private calculateSlippage(quantity: number, price: number): number {
    return quantity * price * this.config.slippage;
  }

  private calculateMaxDrawdown(): number {
    let maxDrawdown = 0;
    let peak = 0;
    let cumulativePnL = 0;

    for (const trade of this.trades) {
      cumulativePnL += trade.pnl || 0;
      if (cumulativePnL > peak) {
        peak = cumulativePnL;
      }
      const drawdown = peak - cumulativePnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private calculateSharpeRatio(_totalPnL: number): number {
    if (this.trades.length < 2) return 0;

    const returns = this.trades.map(t => (t.pnl || 0) / this.config.initialCapital);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;
    return (avgReturn / stdDev) * Math.sqrt(252); // Annualized
  }

  reset(): void {
    this.currentPosition = 'HOLD';
    this.entryPrice = 0;
    this.entryTime = 0;
    this.trades = [];
  }
}

export function generateSyntheticData(
  symbol: string,
  numPoints: number = 1000,
  startPrice: number = 50000
): DataPoint[] {
  const data: DataPoint[] = [];
  let price = startPrice;
  let timestamp = Date.now() - numPoints * 60000; // Start numPoints minutes ago

  for (let i = 0; i < numPoints; i++) {
    // Random walk with drift
    const drift = 0.0001;
    const volatility = 0.02;
    const shock = (Math.random() - 0.5) * volatility;
    price = price * (1 + drift + shock);

    const ctx: MarketContext = {
      symbol,
      timestamp: timestamp + i * 60000,
      price,
      volume: Math.random() * 1000 + 100,
      buyVolume: Math.random() * 500 + 50,
      sellVolume: Math.random() * 500 + 50,
      orderBookImbalance: (Math.random() - 0.5) * 0.4,
      fundingRate: (Math.random() - 0.5) * 0.01,
      openInterest: Math.random() * 1000000 + 500000,
      liquidationLong: Math.random() * 100000,
      liquidationShort: Math.random() * 100000,
      volatility: Math.random(),
    };

    data.push({
      ctx,
      trades: [],
      orderBook: {
        bids: [[price * 0.999, Math.random() * 1000]],
        asks: [[price * 1.001, Math.random() * 1000]],
      },
    });
  }

  return data;
}

export async function runMonteCarloSimulation(
  backtester: Backtester,
  dataFeed: DataPoint[],
  numSimulations: number = 100,
  noiseLevel: number = 0.01
): Promise<{ meanPnL: number; stdDevPnL: number; confidenceInterval: [number, number] }> {
  const pnLs: number[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    // Add noise to data
    const noisyFeed = dataFeed.map(dp => ({
      ...dp,
      ctx: {
        ...dp.ctx,
        price: dp.ctx.price * (1 + (Math.random() - 0.5) * noiseLevel),
      },
    }));

    backtester.reset();
    const results = await backtester.run(noisyFeed);
    pnLs.push(results.totalPnL);
  }

  const meanPnL = pnLs.reduce((a, b) => a + b, 0) / pnLs.length;
  const variance = pnLs.reduce((sum, pnl) => sum + Math.pow(pnl - meanPnL, 2), 0) / pnLs.length;
  const stdDevPnL = Math.sqrt(variance);
  const confidenceInterval: [number, number] = [
    meanPnL - 1.96 * stdDevPnL,
    meanPnL + 1.96 * stdDevPnL,
  ];

  return { meanPnL, stdDevPnL, confidenceInterval };
}
