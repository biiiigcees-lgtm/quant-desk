import { AGENT_MODEL_POLICY } from '../models/policy.js';
import { makeAgentSystemPrompt } from '../prompts/templates.js';
import { assertConfidence, makeCompactContext, parseAgentJson } from './common.js';
export const anomalyDetectionAgent = {
    kind: 'anomaly-detection',
    preferredModels: AGENT_MODEL_POLICY['anomaly-detection'],
    debounceMs: 800,
    cacheTtlMs: 2000,
    buildSystemPrompt: () => makeAgentSystemPrompt('Anomaly Detection Agent (structural break and manipulation detector)', '{"anomalyScore":0-100,"anomalyType":"string","severity":"low|medium|high|critical","confidence":0-1,"missing_data":boolean}'),
    buildUserPrompt: (context) => `Detect anomalies for ${context.contractId}. Trigger=${context.triggerEvent}. Input=${makeCompactContext(context.payload)}`,
    parseOutput: (raw) => {
        const parsed = parseAgentJson(raw);
        const severity = parsed.severity === 'medium' || parsed.severity === 'high' || parsed.severity === 'critical'
            ? parsed.severity
            : 'low';
        return {
            anomalyScore: Math.max(0, Math.min(100, Number(parsed.anomalyScore ?? 0))),
            anomalyType: String(parsed.anomalyType ?? 'none'),
            severity,
            confidence: assertConfidence(parsed.confidence),
            missing_data: Boolean(parsed.missing_data),
        };
    },
};
