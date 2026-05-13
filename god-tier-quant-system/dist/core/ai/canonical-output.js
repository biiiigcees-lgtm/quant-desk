const VALID_BIAS = new Set(['LONG', 'SHORT', 'WAIT']);
const VALID_EXEC = new Set(['EXECUTE', 'WAIT', 'BLOCK']);
function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v) && !isNaN(v);
}
function isInRange(v) {
    return v >= 0 && v <= 1;
}
/**
 * Strict validation — collects ALL errors before returning.
 */
export function validateCanonicalAIOutput(raw) {
    const errors = [];
    if (raw === null || typeof raw !== 'object') {
        return { ok: false, errors: ['Input must be a non-null object'] };
    }
    const obj = raw;
    // bias
    if (!VALID_BIAS.has(obj['bias'])) {
        errors.push(`bias must be 'LONG' | 'SHORT' | 'WAIT', got: ${JSON.stringify(obj['bias'])}`);
    }
    // executionRecommendation
    if (!VALID_EXEC.has(obj['executionRecommendation'])) {
        errors.push(`executionRecommendation must be 'EXECUTE' | 'WAIT' | 'BLOCK', got: ${JSON.stringify(obj['executionRecommendation'])}`);
    }
    // numeric fields
    for (const field of ['confidence', 'uncertainty', 'riskLevel']) {
        const val = obj[field];
        if (!isFiniteNumber(val)) {
            errors.push(`${field} must be a finite number, got: ${JSON.stringify(val)}`);
        }
        else if (!isInRange(val)) {
            errors.push(`${field} must be in [0, 1], got: ${val}`);
        }
    }
    // reasoning
    if (!Array.isArray(obj['reasoning'])) {
        errors.push('reasoning must be an array');
    }
    else {
        if (obj['reasoning'].length < 1) {
            errors.push('reasoning must have at least 1 item');
        }
        if (obj['reasoning'].length > 10) {
            errors.push(`reasoning must have at most 10 items, got: ${obj['reasoning'].length}`);
        }
        for (let i = 0; i < obj['reasoning'].length; i++) {
            if (typeof obj['reasoning'][i] !== 'string') {
                errors.push(`reasoning[${i}] must be a string`);
            }
        }
    }
    // invalidation
    if (!Array.isArray(obj['invalidation'])) {
        errors.push('invalidation must be an array');
    }
    else {
        if (obj['invalidation'].length > 5) {
            errors.push(`invalidation must have at most 5 items, got: ${obj['invalidation'].length}`);
        }
        for (let i = 0; i < obj['invalidation'].length; i++) {
            if (typeof obj['invalidation'][i] !== 'string') {
                errors.push(`invalidation[${i}] must be a string`);
            }
        }
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        data: {
            bias: obj['bias'],
            confidence: obj['confidence'],
            uncertainty: obj['uncertainty'],
            riskLevel: obj['riskLevel'],
            reasoning: obj['reasoning'],
            invalidation: obj['invalidation'],
            executionRecommendation: obj['executionRecommendation'],
        },
    };
}
// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------
function clamp01(v, fallback) {
    if (!isFiniteNumber(v))
        return fallback;
    if (v < 0)
        return 0;
    if (v > 1)
        return 1;
    return v;
}
function inferBias(obj) {
    const raw = (obj['bias'] ?? obj['direction'] ?? obj['sentiment'] ?? '');
    const up = typeof raw === 'string' ? raw.toUpperCase() : '';
    if (up === 'LONG' || up === 'BUY' || up === 'BULLISH' || up === 'UP')
        return 'LONG';
    if (up === 'SHORT' || up === 'SELL' || up === 'BEARISH' || up === 'DOWN')
        return 'SHORT';
    return 'WAIT';
}
function inferExecRecommendation(obj) {
    const raw = (obj['executionRecommendation'] ?? obj['recommendation'] ?? obj['action'] ?? '');
    const up = typeof raw === 'string' ? raw.toUpperCase() : '';
    if (up === 'EXECUTE' || up === 'GO' || up === 'TRADE')
        return 'EXECUTE';
    if (up === 'BLOCK' || up === 'HALT' || up === 'STOP')
        return 'BLOCK';
    return 'WAIT';
}
function coerceStringArray(val, maxLen, minLen) {
    if (!Array.isArray(val)) {
        if (typeof val === 'string' && val.length > 0)
            return [val];
        if (minLen > 0)
            return ['(no reasoning provided)'];
        return [];
    }
    const result = [];
    for (const item of val) {
        if (result.length >= maxLen)
            break;
        result.push(typeof item === 'string' ? item : String(item));
    }
    if (result.length < minLen) {
        result.push('(no reasoning provided)');
    }
    return result;
}
/**
 * Best-effort coercion — never throws.
 * Infers fields from common agent output shapes.
 */
export function coerceToCanonical(raw, agentKind) {
    try {
        const obj = raw !== null && typeof raw === 'object' ? raw : {};
        const confidence = clamp01(obj['confidence'] ?? obj['score'] ?? obj['probability'], 0.5);
        const uncertainty = clamp01(obj['uncertainty'] ?? obj['entropy'] ?? (1 - confidence), 1 - confidence);
        const riskLevel = clamp01(obj['riskLevel'] ?? obj['risk'] ?? obj['riskScore'], 0.5);
        const bias = inferBias(obj);
        const executionRecommendation = inferExecRecommendation(obj);
        const reasoning = coerceStringArray(obj['reasoning'] ?? obj['rationale'] ?? obj['explanation'], 10, 1);
        const invalidation = coerceStringArray(obj['invalidation'] ?? obj['stopConditions'] ?? obj['conditions'], 5, 0);
        return {
            bias,
            confidence,
            uncertainty,
            riskLevel,
            reasoning,
            invalidation,
            executionRecommendation,
        };
    }
    catch {
        // Absolute fallback — safe defaults
        return {
            bias: 'WAIT',
            confidence: 0,
            uncertainty: 1,
            riskLevel: 1,
            reasoning: [`coercion failed for agent: ${agentKind}`],
            invalidation: [],
            executionRecommendation: 'BLOCK',
        };
    }
}
