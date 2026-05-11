import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { AgentSpec, AgentTaskContext } from '../types.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';

export interface StrategyEvolutionOutput {
  fitnessScores: Record<string, number>;
  underperformingStrategies: string[];
  suggestedParameterChanges: Record<string, number>;
  confidence: number;
  missing_data: boolean;
}

export const strategyEvolutionAgent: AgentSpec<StrategyEvolutionOutput> = {
  kind: 'strategy-evolution',
  preferredModels: AGENT_MODEL_POLICY['strategy-evolution'],
  debounceMs: 5_000,
  cacheTtlMs: 10_000,
  buildSystemPrompt: () =>
    makeAgentSystemPrompt(
      'Strategy Evolution Agent (research desk, no execution authority)',
      '{"fitnessScores":{"strategy":number},"underperformingStrategies":["string"],"suggestedParameterChanges":{"param":number},"confidence":0-1,"missing_data":boolean}',
    ),
  buildUserPrompt: (context: AgentTaskContext) =>
    `Evaluate strategy fitness for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
  parseOutput: (raw: string) => {
    const parsed = parseAgentJson<StrategyEvolutionOutput>(raw);
    return {
      fitnessScores: normalizeNumberMap(parsed.fitnessScores),
      underperformingStrategies: Array.isArray(parsed.underperformingStrategies)
        ? parsed.underperformingStrategies.map(String)
        : [],
      suggestedParameterChanges: normalizeNumberMap(parsed.suggestedParameterChanges),
      confidence: assertConfidence(parsed.confidence),
      missing_data: Boolean(parsed.missing_data),
    };
  },
};

function normalizeNumberMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, Number(v ?? 0)]),
  );
}
