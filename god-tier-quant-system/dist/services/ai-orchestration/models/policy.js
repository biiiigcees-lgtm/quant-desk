export const MODEL_TIERS = {
    fast: ['openai/gpt-oss-20b:free', 'meta-llama/llama-3.3-70b-instruct:free'],
    reasoning: ['meta-llama/llama-3.3-70b-instruct:free', 'nousresearch/hermes-3-llama-3.1-405b:free'],
    lowLatency: ['openai/gpt-oss-20b:free', 'nvidia/nemotron-3-super-120b-a12b:free'],
};
export const AGENT_MODEL_POLICY = {
    'market-analyst': [...MODEL_TIERS.fast],
    'probability-calibration': [...MODEL_TIERS.reasoning],
    'risk-governor': [...MODEL_TIERS.reasoning],
    'strategy-evolution': [...MODEL_TIERS.reasoning],
    'microstructure-intelligence': [...MODEL_TIERS.fast],
    'execution-intelligence': [...MODEL_TIERS.lowLatency],
    'memory-research': [...MODEL_TIERS.reasoning],
    'anomaly-detection': [...MODEL_TIERS.fast],
    'meta-orchestrator': [...MODEL_TIERS.reasoning],
};
// Approximate model costs used for runtime efficiency telemetry.
export const MODEL_COST_USD_PER_1M_TOKENS = {
    'openai/gpt-oss-20b:free': { input: 0, output: 0 },
    'meta-llama/llama-3.3-70b-instruct:free': { input: 0, output: 0 },
    'nousresearch/hermes-3-llama-3.1-405b:free': { input: 0, output: 0 },
    'nvidia/nemotron-3-super-120b-a12b:free': { input: 0, output: 0 },
};
