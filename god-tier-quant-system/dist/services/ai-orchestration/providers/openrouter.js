import { MODEL_COST_USD_PER_1M_TOKENS } from '../models/policy.js';
export class OpenRouterProvider {
    constructor(options) {
        this.options = options;
    }
    async run(systemPrompt, userPrompt, preferredModels) {
        let lastError = null;
        for (let i = 0; i < preferredModels.length; i += 1) {
            const model = preferredModels[i];
            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    signal: AbortSignal.timeout(this.options.timeoutMs),
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.options.apiKey}`,
                        ...(this.options.referer ? { 'HTTP-Referer': this.options.referer } : {}),
                        ...(this.options.title ? { 'X-Title': this.options.title } : {}),
                    },
                    body: JSON.stringify({
                        model,
                        temperature: this.options.temperature,
                        max_tokens: this.options.maxTokens,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt },
                        ],
                    }),
                });
                if (response.status === 429 || response.status === 503) {
                    const msg = await response.text();
                    lastError = new Error(`temporary model failure ${response.status}: ${msg.slice(0, 160)}`);
                    continue;
                }
                if (!response.ok) {
                    const msg = await response.text();
                    throw new Error(`openrouter error ${response.status}: ${msg.slice(0, 240)}`);
                }
                const body = (await response.json());
                const text = body.choices?.[0]?.message?.content;
                if (!text) {
                    throw new Error('openrouter returned empty content');
                }
                const promptTokens = body.usage?.prompt_tokens;
                const completionTokens = body.usage?.completion_tokens;
                const totalTokens = body.usage?.total_tokens;
                const usedModel = body.model ?? model;
                return {
                    model: usedModel,
                    text,
                    promptTokens,
                    completionTokens,
                    totalTokens,
                    estimatedCostUsd: estimateCostUsd(usedModel, promptTokens, completionTokens),
                    fallbackDepth: i,
                };
            }
            catch (error) {
                lastError = error;
            }
        }
        throw lastError ?? new Error('all models failed');
    }
}
function estimateCostUsd(model, promptTokens, completionTokens) {
    const rates = MODEL_COST_USD_PER_1M_TOKENS[model];
    if (!rates || promptTokens == null || completionTokens == null) {
        return undefined;
    }
    return (promptTokens / 1000000) * rates.input + (completionTokens / 1000000) * rates.output;
}
