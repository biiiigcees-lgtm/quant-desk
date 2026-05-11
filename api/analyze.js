import { systemTruth } from './system-truth.js';

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
    signal: AbortSignal.timeout(9000),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://quant-desk-sooty.vercel.app',
      'X-Title': 'QUANT//DESK BTC Terminal',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt },
      ],
    }),
  });

  if (res.status === 400) {
    const err = await res.text();
    const e = new Error(`400: ${err.slice(0, 120)}`);
    e.permanent = true; // do not retry on other models
    throw e;
  }
  if (res.status === 429 || res.status === 503) {
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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function truthGateResponse() {
  if (systemTruth.riskLevel === 'HIGH' || systemTruth.riskLevel === 'CRITICAL') {
    return {
      blocked: true,
      reason: 'EXECUTION_LOCKED: Risk level too high',
      executionAllowed: false,
      riskLevel: systemTruth.riskLevel,
      snapshotId: systemTruth.snapshotId,
    };
  }

  if (systemTruth.executionAllowed === false) {
    return {
      blocked: true,
      reason: 'EXECUTION_LOCKED: Execution disabled by system truth',
      executionAllowed: false,
      riskLevel: systemTruth.riskLevel,
      snapshotId: systemTruth.snapshotId,
    };
  }

  return null;
}

function snapshotGateResponse(requestBody) {
  const requestSnapshotId = requestBody.snapshotId;
  const snapshotTimestamp = Number(requestBody.snapshotTimestamp);

  if (typeof requestSnapshotId !== 'string' || !Number.isFinite(snapshotTimestamp)) {
    return {
      stale: true,
      reason: 'Missing or invalid snapshot metadata',
      snapshotId: systemTruth.snapshotId,
    };
  }

  const snapshotAge = Date.now() - snapshotTimestamp;
  if (snapshotAge > 5000) {
    return {
      stale: true,
      reason: 'Snapshot too old — market state has changed',
      snapshotId: systemTruth.snapshotId,
    };
  }

  if (requestSnapshotId !== systemTruth.snapshotId) {
    return {
      stale: true,
      reason: 'Snapshot mismatch — market state has changed',
      snapshotId: systemTruth.snapshotId,
    };
  }

  return null;
}

function promptValidationError(prompt, system) {
  if (!prompt) return { status: 400, payload: { error: 'Missing prompt' } };
  if (typeof prompt !== 'string' || prompt.length > 8000) {
    return { status: 400, payload: { error: 'Prompt exceeds maximum length' } };
  }
  if (system && (typeof system !== 'string' || system.length > 2000)) {
    return { status: 400, payload: { error: 'System prompt exceeds maximum length' } };
  }
  return null;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const truthGate = truthGateResponse();
  if (truthGate) return res.status(200).json(truthGate);

  const requestBody = req.body ?? {};
  const snapshotGate = snapshotGateResponse(requestBody);
  if (snapshotGate) return res.status(200).json(snapshotGate);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const { prompt, system } = requestBody;
  const validationError = promptValidationError(prompt, system);
  if (validationError) return res.status(validationError.status).json(validationError.payload);

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
      if (err.permanent) {
        return res.status(400).json({ error: 'Model rejected request', details: err.message });
      }
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
