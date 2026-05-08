// Model priority list — tries each in order, skips on 429/error
const MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',   // 120B, fast when available
  'openai/gpt-oss-20b:free',                  // Clean output, slower
  'meta-llama/llama-3.3-70b-instruct:free',   // Best reasoning, rate-limited
  'nousresearch/hermes-3-llama-3.1-405b:free',// 405B fallback
];

async function callOpenRouter(model, system, prompt, apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://quant-desk-sooty.vercel.app',
      'X-Title': 'QUANT//DESK BTC Terminal',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt },
      ],
    }),
  });

  if (res.status === 429 || res.status === 503 || res.status === 400) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err.slice(0, 120)}`);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err.slice(0, 120)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from model');
  return { text, model: data.model, usage: data.usage };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const { prompt, system } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  if (typeof prompt !== 'string' || prompt.length > 8000)
    return res.status(400).json({ error: 'Prompt exceeds maximum length' });
  if (system && (typeof system !== 'string' || system.length > 2000))
    return res.status(400).json({ error: 'System prompt exceeds maximum length' });

  const systemPrompt = system || 'You are an expert BTC quantitative analyst. Be decisive and concise.';

  let lastError = null;

  for (const model of MODELS) {
    try {
      const { text, model: usedModel, usage } = await callOpenRouter(model, systemPrompt, prompt, apiKey);

      // Normalize to Anthropic-shape so frontend works unchanged
      return res.status(200).json({
        content: [{ type: 'text', text }],
        model: usedModel,
        usage,
      });
    } catch (err) {
      console.warn(`[analyze] Model ${model} failed: ${err.message}`);
      lastError = err;
      // Continue to next model
    }
  }

  // All models failed
  return res.status(503).json({
    error: 'All AI models unavailable',
    details: lastError?.message || 'Rate limits exceeded on all free models. Try again in a few seconds.',
  });
}
