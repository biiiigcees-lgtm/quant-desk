import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { AgentSpec, AgentTaskContext } from '../types.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';

export interface ExecutionIntelligenceOutput {
  orderStyle: 'market' | 'passive' | 'sliced';
  slices: number;
  timingMs: number;
  expectedSlippage: number;
  fillProbability: number;
  confidence: number;
  missing_data: boolean;
}

export const executionIntelligenceAgent: AgentSpec<ExecutionIntelligenceOutput> = {
  kind: 'execution-intelligence',
  preferredModels: AGENT_MODEL_POLICY['execution-intelligence'],
  debounceMs: 750,
  cacheTtlMs: 2_500,
  buildSystemPrompt: () =>
    makeAgentSystemPrompt(
      'Execution Intelligence Agent (optimize how to execute, never whether to trade)',
      '{"orderStyle":"market|passive|sliced","slices":1-10,"timingMs":0-5000,"expectedSlippage":0-1,"fillProbability":0-1,"confidence":0-1,"missing_data":boolean}',
    ),
  buildUserPrompt: (context: AgentTaskContext) =>
    `Propose execution tactics for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
  parseOutput: (raw: string) => {
    const parsed = parseAgentJson<ExecutionIntelligenceOutput>(raw);
    const orderStyle =
      parsed.orderStyle === 'passive' || parsed.orderStyle === 'sliced' ? parsed.orderStyle : 'market';
    return {
      orderStyle,
      slices: Math.max(1, Math.min(10, Number(parsed.slices ?? 1))),
      timingMs: Math.max(0, Math.min(5000, Number(parsed.timingMs ?? 0))),
      expectedSlippage: Math.max(0, Math.min(1, Number(parsed.expectedSlippage ?? 0.01))),
      fillProbability: Math.max(0, Math.min(1, Number(parsed.fillProbability ?? 0.5))),
      confidence: assertConfidence(parsed.confidence),
      missing_data: Boolean(parsed.missing_data),
    };
  },
};
