import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { AgentSpec, AgentTaskContext } from '../types.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';

export interface MetaOrchestratorOutput {
  resolvedConfidence: number;
  conflicts: string[];
  conflictResolution: string;
  confidence: number;
  missing_data: boolean;
}

export const metaOrchestratorAgent: AgentSpec<MetaOrchestratorOutput> = {
  kind: 'meta-orchestrator',
  preferredModels: AGENT_MODEL_POLICY['meta-orchestrator'],
  debounceMs: 2_000,
  cacheTtlMs: 5_000,
  buildSystemPrompt: () =>
    makeAgentSystemPrompt(
      'Meta Orchestrator Agent (conflict resolution only, still advisory)',
      '{"resolvedConfidence":0-1,"conflicts":["string"],"conflictResolution":"string","confidence":0-1,"missing_data":boolean}',
    ),
  buildUserPrompt: (context: AgentTaskContext) =>
    `Resolve agent conflicts for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
  parseOutput: (raw: string) => {
    const parsed = parseAgentJson<MetaOrchestratorOutput>(raw);
    return {
      resolvedConfidence: assertConfidence(parsed.resolvedConfidence),
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts.map(String) : [],
      conflictResolution: String(parsed.conflictResolution ?? ''),
      confidence: assertConfidence(parsed.confidence),
      missing_data: Boolean(parsed.missing_data),
    };
  },
};
