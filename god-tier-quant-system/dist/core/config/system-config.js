export function loadConfig() {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY ?? '';
    return {
        simulationMode: (process.env.SIMULATION_MODE ?? 'true').toLowerCase() === 'true',
        apiHost: process.env.API_HOST ?? '127.0.0.1',
        apiPort: Number(process.env.API_PORT ?? 9191),
        initialCapital: Number(process.env.INITIAL_CAPITAL ?? 10000),
        riskLimit: Number(process.env.RISK_LIMIT ?? 0.02),
        minEdge: Number(process.env.MIN_EDGE ?? 0.01),
        snapshot: {
            maxSourceAgeMs: Number(process.env.SNAPSHOT_MAX_SOURCE_AGE_MS ?? 2500),
            maxClockDriftMs: Number(process.env.SNAPSHOT_MAX_CLOCK_DRIFT_MS ?? 1200),
        },
        orchestration: {
            enabled: (process.env.AI_ORCHESTRATION_ENABLED ?? (openRouterApiKey ? 'true' : 'false')).toLowerCase() === 'true',
            defaultContractId: process.env.AI_ORCHESTRATION_DEFAULT_CONTRACT_ID ?? 'KXBTC-DEMO',
            maxParallel: Number(process.env.AI_ORCHESTRATION_MAX_PARALLEL ?? 3),
            shadowMode: (process.env.AI_ORCHESTRATION_SHADOW_MODE ?? 'false').toLowerCase() === 'true',
            circuitBreaker: {
                failureThreshold: Number(process.env.AI_ORCHESTRATION_BREAKER_FAILURE_THRESHOLD ?? 3),
                cooldownMs: Number(process.env.AI_ORCHESTRATION_BREAKER_COOLDOWN_MS ?? 20000),
            },
        },
        openRouter: {
            apiKey: openRouterApiKey,
            timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS ?? 9000),
            referer: process.env.OPENROUTER_REFERER,
            title: process.env.OPENROUTER_TITLE ?? 'god-tier-quant-system',
            maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS ?? 900),
            temperature: Number(process.env.OPENROUTER_TEMPERATURE ?? 0.15),
        },
    };
}
