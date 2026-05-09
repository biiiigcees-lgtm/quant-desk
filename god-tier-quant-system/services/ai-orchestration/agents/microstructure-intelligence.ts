import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { AgentSpec, AgentTaskContext } from '../types.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';

export interface MicrostructureIntelligenceOutput {
  liquidityRegime: string;
  manipulationRiskScore: number;
  executionQualityConditions: string;
  confidence: number;
  missing_data: boolean;
}

export const microstructureIntelligenceAgent: AgentSpec<MicrostructureIntelligenceOutput> = {
  kind: 'microstructure-intelligence',
  preferredModels: AGENT_MODEL_POLICY['microstructure-intelligence'],
  debounceMs: 900,
  cacheTtlMs: 2_500,
  buildSystemPrompt: () =>
    makeAgentSystemPrompt(
      'Microstructure Intelligence Agent (order-flow and liquidity safety analyzer)',
      '{"liquidityRegime":"string","manipulationRiskScore":0-100,"executionQualityConditions":"string","confidence":0-1,"missing_data":boolean}',
    ),
  buildUserPrompt: (context: AgentTaskContext) =>
    `Analyze microstructure safety for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
  parseOutput: (raw: string) => {
    const parsed = parseAgentJson<MicrostructureIntelligenceOutput>(raw);
    return {
      liquidityRegime: String(parsed.liquidityRegime ?? 'unknown'),
      manipulationRiskScore: Math.max(0, Math.min(100, Number(parsed.manipulationRiskScore ?? 50))),
      executionQualityConditions: String(parsed.executionQualityConditions ?? ''),
      confidence: assertConfidence(parsed.confidence),
      missing_data: Boolean(parsed.missing_data),
    };
  },
};
