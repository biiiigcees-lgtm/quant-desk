import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { AgentSpec, AgentTaskContext } from '../types.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';

export interface ProbabilityCalibrationOutput {
  calibrationScore: number;
  brierScore: number;
  overconfidenceDetected: boolean;
  recommendedAdjustment: number;
  confidence: number;
  missing_data: boolean;
}

export const probabilityCalibrationAgent: AgentSpec<ProbabilityCalibrationOutput> = {
  kind: 'probability-calibration',
  preferredModels: AGENT_MODEL_POLICY['probability-calibration'],
  debounceMs: 1200,
  cacheTtlMs: 5_000,
  buildSystemPrompt: () =>
    makeAgentSystemPrompt(
      'Probability Calibration Agent (auditor only, no execution authority)',
      '{"calibrationScore":0-1,"brierScore":0-1,"overconfidenceDetected":boolean,"recommendedAdjustment":-0.2..0.2,"confidence":0-1,"missing_data":boolean}',
    ),
  buildUserPrompt: (context: AgentTaskContext) =>
    `Audit model calibration for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
  parseOutput: (raw: string) => {
    const parsed = parseAgentJson<ProbabilityCalibrationOutput>(raw);
    return {
      calibrationScore: Number(parsed.calibrationScore ?? 0),
      brierScore: Number(parsed.brierScore ?? 1),
      overconfidenceDetected: Boolean(parsed.overconfidenceDetected),
      recommendedAdjustment: Math.max(-0.2, Math.min(0.2, Number(parsed.recommendedAdjustment ?? 0))),
      confidence: assertConfidence(parsed.confidence),
      missing_data: Boolean(parsed.missing_data),
    };
  },
};
