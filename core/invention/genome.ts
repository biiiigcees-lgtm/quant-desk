export interface Node { id: string; type: 'INPUT' | 'HIDDEN' | 'OUTPUT'; activation: 'RELU' | 'SIGMOID' | 'TANH' | 'LINEAR'; }
export interface Connection { from: string; to: string; weight: number; }
export interface PerformanceMetrics { totalTrades: number; wins: number; losses: number; winRate: number; totalPnL: number; avgPnL: number; maxDrawdown: number; sharpeRatio: number; fitness: number; }
export interface StrategyGenome { id: string; nodes: Node[]; connections: Connection[]; thresholds: Record<string, number>; mutationRate: number; performance: PerformanceMetrics; generation: number; createdAt: number; lastUpdated: number; }

export function createRandomGenome(id: string, generation: number = 0): StrategyGenome {
  const nodes: Node[] = [
    { id: 'input_1', type: 'INPUT', activation: 'LINEAR' },
    { id: 'input_2', type: 'INPUT', activation: 'LINEAR' },
    { id: 'input_3', type: 'INPUT', activation: 'LINEAR' },
    { id: 'hidden_1', type: 'HIDDEN', activation: 'RELU' },
    { id: 'hidden_2', type: 'HIDDEN', activation: 'SIGMOID' },
    { id: 'output', type: 'OUTPUT', activation: 'SIGMOID' },
  ];
  const connections: Connection[] = [
    { from: 'input_1', to: 'hidden_1', weight: Math.random() * 2 - 1 },
    { from: 'input_2', to: 'hidden_1', weight: Math.random() * 2 - 1 },
    { from: 'input_3', to: 'hidden_1', weight: Math.random() * 2 - 1 },
    { from: 'input_1', to: 'hidden_2', weight: Math.random() * 2 - 1 },
    { from: 'input_2', to: 'hidden_2', weight: Math.random() * 2 - 1 },
    { from: 'input_3', to: 'hidden_2', weight: Math.random() * 2 - 1 },
    { from: 'hidden_1', to: 'output', weight: Math.random() * 2 - 1 },
    { from: 'hidden_2', to: 'output', weight: Math.random() * 2 - 1 },
  ];
  const thresholds = { hidden_1: Math.random() * 2 - 1, hidden_2: Math.random() * 2 - 1, output: Math.random() * 2 - 1 };
  return { id, nodes, connections, thresholds, mutationRate: 0.1, performance: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0, avgPnL: 0, maxDrawdown: 0, sharpeRatio: 0, fitness: 0.5 }, generation, createdAt: Date.now(), lastUpdated: Date.now() };
}

export function executeGenome(genome: StrategyGenome, inputs: number[]): number {
  const values: Record<string, number> = {};
  genome.nodes.filter(n => n.type === 'INPUT').forEach((n, i) => values[n.id] = inputs[i] || 0);
  
  const activate = (value: number, type: Node['activation']): number => {
    switch (type) {
      case 'RELU': return Math.max(0, value);
      case 'SIGMOID': return 1 / (1 + Math.exp(-value));
      case 'TANH': return Math.tanh(value);
      default: return value;
    }
  };
  
  const hiddenNodes = genome.nodes.filter(n => n.type === 'HIDDEN');
  hiddenNodes.forEach(node => {
    const incoming = genome.connections.filter(c => c.to === node.id);
    const sum = incoming.reduce((acc, c) => acc + (values[c.from] || 0) * c.weight, 0);
    values[node.id] = activate(sum - (genome.thresholds[node.id] || 0), node.activation);
  });
  
  const outputNode = genome.nodes.find(n => n.type === 'OUTPUT');
  if (outputNode) {
    const incoming = genome.connections.filter(c => c.to === outputNode.id);
    const sum = incoming.reduce((acc, c) => acc + (values[c.from] || 0) * c.weight, 0);
    return activate(sum - (genome.thresholds[outputNode.id] || 0), outputNode.activation);
  }
  return 0.5;
}

export function selectTopPerformers(population: StrategyGenome[], count: number): StrategyGenome[] {
  return population.sort((a, b) => b.performance.fitness - a.performance.fitness).slice(0, count);
}
