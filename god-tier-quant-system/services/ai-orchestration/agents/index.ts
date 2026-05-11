import { AgentKind, AgentSpec } from '../types.js';
import { anomalyDetectionAgent } from './anomaly-detection.js';
import { executionIntelligenceAgent } from './execution-intelligence.js';
import { marketAnalystAgent } from './market-analyst.js';
import { memoryResearchAgent } from './memory-research.js';
import { metaOrchestratorAgent } from './meta-orchestrator.js';
import { microstructureIntelligenceAgent } from './microstructure-intelligence.js';
import { probabilityCalibrationAgent } from './probability-calibration.js';
import { riskGovernorAgent } from './risk-governor.js';
import { strategyEvolutionAgent } from './strategy-evolution.js';
import { getAgentModelPolicy, getModelEnvelopeFromEnv } from '../models/policy.js';

export const AGENT_SPECS: Record<AgentKind, AgentSpec<unknown>> = {
  'market-analyst': marketAnalystAgent,
  'probability-calibration': probabilityCalibrationAgent,
  'risk-governor': riskGovernorAgent,
  'strategy-evolution': strategyEvolutionAgent,
  'microstructure-intelligence': microstructureIntelligenceAgent,
  'execution-intelligence': executionIntelligenceAgent,
  'memory-research': memoryResearchAgent,
  'anomaly-detection': anomalyDetectionAgent,
  'meta-orchestrator': metaOrchestratorAgent,
};

const envelopePolicy = getAgentModelPolicy(getModelEnvelopeFromEnv());
for (const [kind, spec] of Object.entries(AGENT_SPECS) as Array<[AgentKind, AgentSpec<unknown>]>) {
  spec.preferredModels = [...envelopePolicy[kind]];
}
