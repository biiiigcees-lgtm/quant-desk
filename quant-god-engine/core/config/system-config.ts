export interface SystemConfig {
  simulationMode: boolean;
  apiHost: string;
  apiPort: number;
  initialCapital: number;
  riskLimit: number;
  minEdge: number;
}

export function loadConfig(): SystemConfig {
  return {
    simulationMode: (process.env.SIMULATION_MODE ?? 'true').toLowerCase() === 'true',
    apiHost: process.env.API_HOST ?? '127.0.0.1',
    apiPort: Number(process.env.API_PORT ?? 9191),
    initialCapital: Number(process.env.INITIAL_CAPITAL ?? 10000),
    riskLimit: Number(process.env.RISK_LIMIT ?? 0.02),
    minEdge: Number(process.env.MIN_EDGE ?? 0.01),
  };
}
