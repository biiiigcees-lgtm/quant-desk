export function extractFirstJsonObject(raw) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('agent did not return valid JSON object text');
    }
    return raw.slice(start, end + 1);
}
export function parseAgentJson(raw) {
    const body = extractFirstJsonObject(raw);
    return JSON.parse(body);
}
export function makeCompactContext(payload, maxLen = 3000) {
    const text = JSON.stringify(payload);
    if (text.length <= maxLen) {
        return text;
    }
    return `${text.slice(0, maxLen)}...[truncated:${text.length - maxLen}]`;
}
export function assertConfidence(input) {
    if (typeof input !== 'number' || Number.isNaN(input)) {
        return 0;
    }
    return Math.max(0, Math.min(1, input));
}
