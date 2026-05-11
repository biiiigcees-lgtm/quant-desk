import { MODEL_COST_USD_PER_1M_TOKENS } from '../models/policy.js';
import { AgentProvider, AgentProviderResult } from '../types.js';

export interface OpenRouterProviderOptions {
  apiKey: string;
  timeoutMs: number;
  referer?: string;
  title?: string;
  maxTokens: number;
  temperature: number;
}

export class OpenRouterProvider implements AgentProvider {
  constructor(private readonly options: OpenRouterProviderOptions) {}

  async run(systemPrompt: string, userPrompt: string, preferredModels: string[]): Promise<AgentProviderResult> {
    let lastError: Error | null = null;
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

        const body = (await response.json()) as {
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          choices?: Array<{ message?: { content?: string } }>;
        };

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
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw lastError ?? new Error('all models failed');
  }
}

function estimateCostUsd(model: string, promptTokens?: number, completionTokens?: number): number | undefined {
  const rates = MODEL_COST_USD_PER_1M_TOKENS[model];
  if (!rates || promptTokens == null || completionTokens == null) {
    return undefined;
  }
  return (promptTokens / 1_000_000) * rates.input + (completionTokens / 1_000_000) * rates.output;
}
