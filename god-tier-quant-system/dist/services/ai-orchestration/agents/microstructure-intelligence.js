import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';
export const microstructureIntelligenceAgent = {
    kind: 'microstructure-intelligence',
    preferredModels: AGENT_MODEL_POLICY['microstructure-intelligence'],
    debounceMs: 900,
    cacheTtlMs: 2500,
    buildSystemPrompt: () => makeAgentSystemPrompt('Microstructure Intelligence Agent (order-flow and liquidity safety analyzer)', '{"liquidityRegime":"string","manipulationRiskScore":0-100,"executionQualityConditions":"string","confidence":0-1,"missing_data":boolean}'),
    buildUserPrompt: (context) => `Analyze microstructure safety for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
    parseOutput: (raw) => {
        const parsed = parseAgentJson(raw);
        return {
            liquidityRegime: String(parsed.liquidityRegime ?? 'unknown'),
            manipulationRiskScore: Math.max(0, Math.min(100, Number(parsed.manipulationRiskScore ?? 50))),
            executionQualityConditions: String(parsed.executionQualityConditions ?? ''),
            confidence: assertConfidence(parsed.confidence),
            missing_data: Boolean(parsed.missing_data),
        };
    },
};
