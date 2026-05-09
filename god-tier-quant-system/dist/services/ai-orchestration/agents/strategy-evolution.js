import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';
export const strategyEvolutionAgent = {
    kind: 'strategy-evolution',
    preferredModels: AGENT_MODEL_POLICY['strategy-evolution'],
    debounceMs: 5000,
    cacheTtlMs: 10000,
    buildSystemPrompt: () => makeAgentSystemPrompt('Strategy Evolution Agent (research desk, no execution authority)', '{"fitnessScores":{"strategy":number},"underperformingStrategies":["string"],"suggestedParameterChanges":{"param":number},"confidence":0-1,"missing_data":boolean}'),
    buildUserPrompt: (context) => `Evaluate strategy fitness for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
    parseOutput: (raw) => {
        const parsed = parseAgentJson(raw);
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
function normalizeNumberMap(input) {
    if (!input || typeof input !== 'object') {
        return {};
    }
    return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Number(v ?? 0)]));
}
