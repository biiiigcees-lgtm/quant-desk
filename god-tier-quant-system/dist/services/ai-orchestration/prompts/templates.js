export const BASE_GUARDRAILS = [
    'You are an advisory AI agent embedded in a trading system.',
    'Return JSON only. No markdown, no prose outside JSON.',
    'Never emit order placement instructions or execution authority claims.',
    'If required data is missing, explicitly set missing_data=true and lower confidence.',
    'Do not hallucinate unavailable fields. Use null when unknown.',
].join(' ');
export function makeAgentSystemPrompt(agentRole, schemaHint) {
    return [
        BASE_GUARDRAILS,
        `Agent role: ${agentRole}.`,
        'Output JSON schema:',
        schemaHint,
    ].join(' ');
}
