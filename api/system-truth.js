import { randomBytes } from 'node:crypto';

const DIRECTION_SET = new Set(['UP', 'DOWN', 'NEUTRAL']);
const RISK_LEVEL_SET = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const RISK_ORDER = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

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
    throw new Error(`${label} must be a boolean`);
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
    throw new Error(`${label} must be a finite number`);
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
    direction: requireEnum(next.direction, new Set(['UP', 'DOWN']), 'direction'),
    actual: requireEnum(next.actual, new Set(['UP', 'DOWN']), 'actual'),
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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json(getSystemTruth());
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const next = updateSystemTruth(req.body ?? {});
    return res.status(200).json(next);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
