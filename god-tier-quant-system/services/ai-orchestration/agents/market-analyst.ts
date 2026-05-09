import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { AgentSpec, AgentTaskContext } from '../types.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';

export interface MarketAnalystOutput {
  narrative: string;
  regimeClassification: string;
  keyObservations: string[];
  confidence: number;
  missing_data: boolean;
}

export const marketAnalystAgent: AgentSpec<MarketAnalystOutput> = {
  kind: 'market-analyst',
  preferredModels: AGENT_MODEL_POLICY['market-analyst'],
  debounceMs: 1500,
  cacheTtlMs: 5_000,
  buildSystemPrompt: () =>
    makeAgentSystemPrompt(
      'Market Analyst Agent (read-only market interpretation)',
      '{"narrative":"string","regimeClassification":"string","keyObservations":["string"],"confidence":0-1,"missing_data":boolean}',
    ),
  buildUserPrompt: (context: AgentTaskContext) =>
    `Analyze market state for contract ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
  parseOutput: (raw: string) => {
    const parsed = parseAgentJson<MarketAnalystOutput>(raw);
    return {
      narrative: String(parsed.narrative ?? ''),
      regimeClassification: String(parsed.regimeClassification ?? 'unknown'),
      keyObservations: Array.isArray(parsed.keyObservations) ? parsed.keyObservations.map(String) : [],
      confidence: assertConfidence(parsed.confidence),
      missing_data: Boolean(parsed.missing_data),
    };
  },
};
