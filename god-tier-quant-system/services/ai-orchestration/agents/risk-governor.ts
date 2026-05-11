import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { AgentSpec, AgentTaskContext } from '../types.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';

export interface RiskGovernorOutput {
  riskLevel: number;
  recommendation: 'de-risk' | 'neutral' | 'scale-up';
  justification: string;
  confidence: number;
  missing_data: boolean;
}

export const riskGovernorAgent: AgentSpec<RiskGovernorOutput> = {
  kind: 'risk-governor',
  preferredModels: AGENT_MODEL_POLICY['risk-governor'],
  debounceMs: 1500,
  cacheTtlMs: 4_000,
  buildSystemPrompt: () =>
    makeAgentSystemPrompt(
      'Risk Governor Agent (advisory risk scaling only)',
      '{"riskLevel":0-100,"recommendation":"de-risk|neutral|scale-up","justification":"string","confidence":0-1,"missing_data":boolean}',
    ),
  buildUserPrompt: (context: AgentTaskContext) =>
    `Assess risk posture for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
  parseOutput: (raw: string) => {
    const parsed = parseAgentJson<RiskGovernorOutput>(raw);
    const recommendation =
      parsed.recommendation === 'de-risk' || parsed.recommendation === 'scale-up' ? parsed.recommendation : 'neutral';
    return {
      riskLevel: Math.max(0, Math.min(100, Number(parsed.riskLevel ?? 50))),
      recommendation,
      justification: String(parsed.justification ?? ''),
      confidence: assertConfidence(parsed.confidence),
      missing_data: Boolean(parsed.missing_data),
    };
  },
};
