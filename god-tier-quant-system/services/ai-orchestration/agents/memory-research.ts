import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { AgentSpec, AgentTaskContext } from '../types.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';

export interface MemoryResearchOutput {
  similarHistoricalRegimes: Array<{ tag: string; similarity: number; outcome: string }>;
  structuralSimilarities: string[];
  confidence: number;
  missing_data: boolean;
}

export const memoryResearchAgent: AgentSpec<MemoryResearchOutput> = {
  kind: 'memory-research',
  preferredModels: AGENT_MODEL_POLICY['memory-research'],
  debounceMs: 4_000,
  cacheTtlMs: 12_000,
  buildSystemPrompt: () =>
    makeAgentSystemPrompt(
      'Memory Research Agent (historical analog retrieval and comparison)',
      '{"similarHistoricalRegimes":[{"tag":"string","similarity":0-1,"outcome":"string"}],"structuralSimilarities":["string"],"confidence":0-1,"missing_data":boolean}',
    ),
  buildUserPrompt: (context: AgentTaskContext) =>
    `Retrieve historical analogs for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
  parseOutput: (raw: string) => {
    const parsed = parseAgentJson<MemoryResearchOutput>(raw);
    const similarHistoricalRegimes = Array.isArray(parsed.similarHistoricalRegimes)
      ? parsed.similarHistoricalRegimes.map((item) => ({
          tag: String(item.tag ?? 'unknown'),
          similarity: Math.max(0, Math.min(1, Number(item.similarity ?? 0))),
          outcome: String(item.outcome ?? ''),
        }))
      : [];
    return {
      similarHistoricalRegimes,
      structuralSimilarities: Array.isArray(parsed.structuralSimilarities)
        ? parsed.structuralSimilarities.map(String)
        : [],
      confidence: assertConfidence(parsed.confidence),
      missing_data: Boolean(parsed.missing_data),
    };
  },
};
