import { StrategyGenome } from './genome';

export function mutateGenome(genome: StrategyGenome): StrategyGenome {
  const mutated = JSON.parse(JSON.stringify(genome)) as StrategyGenome;
  mutated.id = `${genome.id}_mut_${Date.now()}`;
  mutated.generation = genome.generation + 1;
  mutated.lastUpdated = Date.now();
  
  // Mutate connection weights
  mutated.connections = mutated.connections.map(conn => {
    if (Math.random() < genome.mutationRate) {
      return { ...conn, weight: conn.weight + (Math.random() * 0.4 - 0.2) };
    }
    return conn;
  });
  
  // Mutate thresholds
  for (const key in mutated.thresholds) {
    if (Math.random() < genome.mutationRate) {
      mutated.thresholds[key] += Math.random() * 0.4 - 0.2;
    }
  }
  
  // Occasionally add new connection
  if (Math.random() < genome.mutationRate * 0.5) {
    const hiddenNodes = mutated.nodes.filter(n => n.type === 'HIDDEN');
    const outputNode = mutated.nodes.find(n => n.type === 'OUTPUT');
    if (hiddenNodes.length > 0 && outputNode) {
      const randomHidden = hiddenNodes[Math.floor(Math.random() * hiddenNodes.length)];
      const exists = mutated.connections.some(c => c.from === randomHidden.id && c.to === outputNode.id);
      if (!exists) {
        mutated.connections.push({ from: randomHidden.id, to: outputNode.id, weight: Math.random() * 2 - 1 });
      }
    }
  }
  
  return mutated;
}

export function crossover(parent1: StrategyGenome, parent2: StrategyGenome): StrategyGenome {
  const child: StrategyGenome = {
    id: `cross_${Date.now()}`,
    nodes: [...parent1.nodes],
    connections: parent1.connections.map((conn, i) => {
      return Math.random() < 0.5 ? conn : parent2.connections[i] || conn;
    }),
    thresholds: { ...parent1.thresholds },
    mutationRate: (parent1.mutationRate + parent2.mutationRate) / 2,
    performance: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0, avgPnL: 0, maxDrawdown: 0, sharpeRatio: 0, fitness: 0.5 },
    generation: Math.max(parent1.generation, parent2.generation) + 1,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };
  
  for (const key in child.thresholds) {
    child.thresholds[key] = Math.random() < 0.5 ? parent1.thresholds[key] : parent2.thresholds[key];
  }
  
  return child;
}
