import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DIRECTION_SET = new Set(['UP', 'DOWN', 'NEUTRAL']);
const RISK_LEVEL_SET = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const RISK_ORDER = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};
const TRADE_DIRECTION_SET = new Set(['UP', 'DOWN']);
const RATE_WINDOW_MS = 60_000;
const MAX_GET_PER_WINDOW = Number.parseInt(process.env.SYSTEM_TRUTH_RATE_LIMIT_GET ?? '120', 10);
const MAX_POST_PER_WINDOW = Number.parseInt(process.env.SYSTEM_TRUTH_RATE_LIMIT_POST ?? '30', 10);
const MAX_SKEW_MS = 300_000;
const REPLAY_TTL_MS = 300_000;
const SIGNED_PATH = '/api/system-truth';
const ALLOW_TRUSTED_UNSIGNED = (process.env.SYSTEM_TRUTH_ALLOW_TRUSTED_UNSIGNED ?? '1') === '1';

const rateState = new Map();
const replayState = new Map();
const AUTH_ERROR_CODES = new Set([
  'missing-auth-headers',
  'invalid-signature-format',
  'invalid-timestamp',
  'timestamp-out-of-window',
  'replay-detected',
  'signature-mismatch',
]);

function parseAllowedOrigins() {
  return (process.env.SYSTEM_TRUTH_ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

function getSigningSecret() {
  return process.env.SYSTEM_TRUTH_HMAC_SECRET ?? null;
}

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function generateSnapshotId(now = Date.now()) {
  const ts = Number.isFinite(now) ? Math.floor(now) : Date.now();
  return `${ts}-${randomBytes(4).toString('hex')}`;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`${label} must be one of: ${Array.from(allowed).join(', ')}`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean`);
  }
  return value;
}

function requireSnapshotId(value) {
  if (typeof value !== 'string' || !/^\d{10,}-[a-f0-9]{8,}$/.test(value)) {
    throw new Error('snapshotId must match "<timestamp>-<random-hex>"');
  }
  return value;
}

function normalizeConfidence(value, label = 'confidence') {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return Number(clamp(confidence, 0, 100).toFixed(2));
}

function validateBelief(currentBelief) {
  const belief = requireObject(currentBelief, 'currentBelief');
  return {
    direction: requireEnum(belief.direction, DIRECTION_SET, 'currentBelief.direction'),
    confidence: normalizeConfidence(belief.confidence, 'currentBelief.confidence'),
  };
}

function cloneTruth() {
  return {
    currentBelief: { ...systemTruth.currentBelief },
    executionAllowed: systemTruth.executionAllowed,
    riskLevel: systemTruth.riskLevel,
    snapshotId: systemTruth.snapshotId,
    lastUpdated: systemTruth.lastUpdated,
  };
}

export const systemTruth = {
  currentBelief: {
    direction: 'NEUTRAL',
    confidence: 0,
  },
  executionAllowed: false,
  riskLevel: 'MEDIUM',
  snapshotId: generateSnapshotId(),
  lastUpdated: Date.now(),
};

export const results = [];

export function getSystemTruth() {
  return cloneTruth();
}

export function updateSystemTruth(nextState) {
  const next = requireObject(nextState, 'system truth payload');
  const snapshotId = requireSnapshotId(next.snapshotId);
  const updated = {
    currentBelief: validateBelief(next.currentBelief),
    executionAllowed: requireBoolean(next.executionAllowed, 'executionAllowed'),
    riskLevel: requireEnum(next.riskLevel, RISK_LEVEL_SET, 'riskLevel'),
    snapshotId,
    lastUpdated: Date.now(),
  };

  systemTruth.currentBelief = updated.currentBelief;
  systemTruth.executionAllowed = updated.executionAllowed;
  systemTruth.riskLevel = updated.riskLevel;
  systemTruth.snapshotId = updated.snapshotId;
  systemTruth.lastUpdated = updated.lastUpdated;

  return cloneTruth();
}

export function appendResult(payload) {
  const next = requireObject(payload, 'result payload');
  const entry = {
    direction: requireEnum(next.direction, TRADE_DIRECTION_SET, 'direction'),
    actual: requireEnum(next.actual, TRADE_DIRECTION_SET, 'actual'),
    confidence: normalizeConfidence(next.confidence),
    riskLevel: requireEnum(next.riskLevel, RISK_LEVEL_SET, 'riskLevel'),
    timestamp: Date.now(),
  };

  results.push(entry);
  while (results.length > 50) results.shift();
  return { ...entry };
}

function toPct(value) {
  return Number(value.toFixed(2));
}

function computeWinRate(entries) {
  if (!entries.length) return 0;
  const wins = entries.filter((entry) => entry.direction === entry.actual).length;
  return toPct((wins / entries.length) * 100);
}

function computeAverageConfidence(entries) {
  if (!entries.length) return 0;
  const total = entries.reduce((sum, entry) => sum + entry.confidence, 0);
  return toPct(total / entries.length);
}

export function computePerformance(sample = results) {
  const window50 = sample.slice(-50);
  const window10 = window50.slice(-10);
  const wins = window50.filter((entry) => entry.direction === entry.actual);
  const losses = window50.filter((entry) => entry.direction !== entry.actual);

  const perRiskLevel = Object.fromEntries(
    Array.from(RISK_LEVEL_SET).map((riskLevel) => {
      const entries = window50.filter((entry) => entry.riskLevel === riskLevel);
      const winCount = entries.filter((entry) => entry.direction === entry.actual).length;
      return [
        riskLevel,
        {
          count: entries.length,
          wins: winCount,
          losses: entries.length - winCount,
          winRate: entries.length ? toPct((winCount / entries.length) * 100) : 0,
        },
      ];
    }),
  );

  const bestRiskLevel = Object.entries(perRiskLevel)
    .filter(([, stats]) => stats.count > 0)
    .sort((a, b) => {
      if (b[1].winRate !== a[1].winRate) return b[1].winRate - a[1].winRate;
      if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return RISK_ORDER[a[0]] - RISK_ORDER[b[0]];
    })[0]?.[0] ?? 'NONE';

  return {
    sampleSize: window50.length,
    winRateLast10: computeWinRate(window10),
    winRateLast50: computeWinRate(window50),
    avgConfidenceWins: computeAverageConfidence(wins),
    avgConfidenceLosses: computeAverageConfidence(losses),
    bestRiskLevel,
    perRiskLevel,
  };
}

function getHeader(req, name) {
  const key = name.toLowerCase();
  const headers = req?.headers ?? {};
  const raw = headers[key] ?? headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes('*')) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function setCors(req, res) {
  const origin = getHeader(req, 'origin');
  let allowOrigin = 'null';
  if (origin && isOriginAllowed(origin)) {
    allowOrigin = origin;
  } else if (ALLOWED_ORIGINS.includes('*')) {
    allowOrigin = '*';
  } else if (ALLOWED_ORIGINS[0]) {
    allowOrigin = ALLOWED_ORIGINS[0];
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Timestamp, X-Signature');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
}

function stableStringify(value) {
  const normalize = (input) => {
    if (input === null || typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map((item) => normalize(item));
    const out = {};
    for (const key of Object.keys(input).sort((a, b) => a.localeCompare(b))) {
      out[key] = normalize(input[key]);
    }
    return out;
  };
  return JSON.stringify(normalize(value));
}

function getClientIp(req) {
  const forwarded = getHeader(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req?.socket?.remoteAddress ?? 'unknown';
}

function pruneReplayStore(nowMs) {
  for (const [token, expiresAt] of replayState.entries()) {
    if (expiresAt <= nowMs) replayState.delete(token);
  }
}

function verifyReplay(signature, timestampMs) {
  const nowMs = Date.now();
  pruneReplayStore(nowMs);
  const replayKey = `${signature}:${timestampMs}`;
  if (replayState.has(replayKey)) {
    throw new Error('replay-detected');
  }
  replayState.set(replayKey, nowMs + REPLAY_TTL_MS);
}

function verifySignature(req, body) {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error('server-misconfigured-no-signing-secret');
  }

  const signature = getHeader(req, 'x-signature');
  const timestampRaw = getHeader(req, 'x-timestamp');

  if (!signature || !timestampRaw) {
    throw new Error('missing-auth-headers');
  }
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    throw new Error('invalid-signature-format');
  }

  const timestampMs = Number(timestampRaw);
  if (!Number.isFinite(timestampMs)) {
    throw new TypeError('invalid-timestamp');
  }
  if (Math.abs(Date.now() - timestampMs) > MAX_SKEW_MS) {
    throw new Error('timestamp-out-of-window');
  }

  verifyReplay(signature.toLowerCase(), timestampMs);

  const canonicalBody = stableStringify(body ?? {});
  const message = `${timestampMs}.POST.${SIGNED_PATH}.${canonicalBody}`;
  const expectedHex = createHmac('sha256', secret).update(message).digest('hex');

  const got = Buffer.from(signature.toLowerCase(), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    throw new Error('signature-mismatch');
  }
}

function hasAuthHeaders(req) {
  return Boolean(getHeader(req, 'x-signature') && getHeader(req, 'x-timestamp'));
}

function canTrustUnsigned(req) {
  if (!ALLOW_TRUSTED_UNSIGNED) return false;
  const origin = getHeader(req, 'origin');
  if (!origin) return false;
  return isOriginAllowed(origin);
}

function statusCodeForError(message) {
  if (message.startsWith('server-misconfigured')) {
    return 500;
  }
  if (AUTH_ERROR_CODES.has(message)) {
    return 401;
  }
  return 400;
}

function handlePostRequest(req, res) {
  try {
    if (hasAuthHeaders(req)) {
      verifySignature(req, req.body ?? {});
    } else if (!canTrustUnsigned(req)) {
      throw new Error('missing-auth-headers');
    }

    const next = updateSystemTruth(req.body ?? {});
    return res.status(200).json(next);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid-request';
    return res.status(statusCodeForError(message)).json({ error: message });
  }
}

function pruneRateStore(nowMs) {
  for (const [key, state] of rateState.entries()) {
    if (state.windowStart + RATE_WINDOW_MS <= nowMs) {
      rateState.delete(key);
    }
  }
}

function enforceRateLimit(req, method) {
  const nowMs = Date.now();
  pruneRateStore(nowMs);

  const ip = getClientIp(req);
  const key = `${ip}:${method}`;
  const maxAllowed = method === 'POST' ? MAX_POST_PER_WINDOW : MAX_GET_PER_WINDOW;
  const current = rateState.get(key);

  if (!current || current.windowStart + RATE_WINDOW_MS <= nowMs) {
    rateState.set(key, { count: 1, windowStart: nowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  if (current.count > maxAllowed) {
    const retryAfterMs = Math.max(1000, current.windowStart + RATE_WINDOW_MS - nowMs);
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    const origin = getHeader(req, 'origin');
    if (origin && !isOriginAllowed(origin) && !ALLOWED_ORIGINS.includes('*')) {
      return res.status(403).json({ error: 'origin-not-allowed' });
    }
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  const limit = enforceRateLimit(req, req.method);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({ error: 'rate-limit-exceeded' });
  }

  if (req.method === 'GET') {
    return res.status(200).json(getSystemTruth());
  }

  return handlePostRequest(req, res);
}
