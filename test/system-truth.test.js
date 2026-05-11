const { beforeEach, describe, it } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { createHmac } = await import('node:crypto');

import systemTruthHandler, {
  appendResult,
  computePerformance,
  generateSnapshotId,
  getSystemTruth,
  results,
  systemTruth,
  updateSystemTruth,
} from '../api/system-truth.js';

function mockReq({ method = 'GET', body, headers = {} } = {}) {
  return {
    method,
    body,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    payload: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function resetSharedState() {
  systemTruth.currentBelief = { direction: 'NEUTRAL', confidence: 0 };
  systemTruth.executionAllowed = false;
  systemTruth.riskLevel = 'MEDIUM';
  systemTruth.authority = {
    source: 'COGNITION_LAYER',
    realityValid: true,
    riskVeto: false,
    simulationPassed: false,
  };
  systemTruth.snapshotId = generateSnapshotId();
  systemTruth.lastUpdated = Date.now();
  results.length = 0;
}

function nextSnapshotId(aheadMs = 10) {
  const [currentTsRaw] = String(systemTruth.snapshotId).split('-', 1);
  const currentTs = Number(currentTsRaw);
  const baseTs = Number.isFinite(currentTs) ? currentTs : Date.now();
  return generateSnapshotId(baseTs + aheadMs);
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

function buildSignedHeaders(body, timestamp = Date.now()) {
  const canonicalBody = stableStringify(body ?? {});
  const message = `${timestamp}.POST./api/system-truth.${canonicalBody}`;
  const signature = createHmac('sha256', process.env.SYSTEM_TRUTH_HMAC_SECRET)
    .update(message)
    .digest('hex');

  return {
    'x-timestamp': String(timestamp),
    'x-signature': signature,
  };
}

describe('system truth state', () => {
  beforeEach(() => {
    process.env.SYSTEM_TRUTH_HMAC_SECRET = 'test-secret';
    resetSharedState();
  });

  it('generates snapshot ids in the expected format', () => {
    const snapshotId = generateSnapshotId(1760000000000);
    assert.match(snapshotId, /^1760000000000-[a-f0-9]{8}$/);
  });

  it('updates the canonical shared truth object', () => {
    const before = Date.now();
    const next = updateSystemTruth({
      currentBelief: { direction: 'UP', confidence: 78.6 },
      executionAllowed: true,
      riskLevel: 'LOW',
      authority: {
        source: 'COGNITION_LAYER',
        realityValid: true,
        riskVeto: false,
        simulationPassed: true,
      },
      snapshotId: nextSnapshotId(50),
    });

    assert.equal(next.currentBelief.direction, 'UP');
    assert.equal(next.executionAllowed, true);
    assert.equal(next.riskLevel, 'LOW');
    assert.equal(next.authority.simulationPassed, true);
    assert.ok(next.lastUpdated >= before);
    assert.deepEqual(getSystemTruth(), next);
  });

  it('rejects executionAllowed=true when authority metadata is missing', () => {
    assert.throws(() => {
      updateSystemTruth({
        currentBelief: { direction: 'UP', confidence: 62 },
        executionAllowed: true,
        riskLevel: 'LOW',
        snapshotId: nextSnapshotId(60),
      });
    }, /authority metadata required/i);
  });

  it('forces execution lock when authority vetoes execution', () => {
    const next = updateSystemTruth({
      currentBelief: { direction: 'UP', confidence: 88 },
      executionAllowed: true,
      riskLevel: 'HIGH',
      authority: {
        source: 'RISK_ENGINE',
        realityValid: true,
        riskVeto: true,
        simulationPassed: true,
      },
      snapshotId: nextSnapshotId(70),
    });

    assert.equal(next.executionAllowed, false);
    assert.equal(next.authority.source, 'RISK_ENGINE');
    assert.equal(next.authority.riskVeto, true);
  });

  it('rejects stale snapshot rollback updates', () => {
    updateSystemTruth({
      currentBelief: { direction: 'UP', confidence: 70 },
      executionAllowed: false,
      riskLevel: 'MEDIUM',
      authority: {
        source: 'COGNITION_LAYER',
        realityValid: true,
        riskVeto: false,
        simulationPassed: false,
      },
      snapshotId: nextSnapshotId(80),
    });

    const [latestTsRaw] = String(systemTruth.snapshotId).split('-', 1);
    const latestTs = Number(latestTsRaw);
    assert.throws(() => {
      updateSystemTruth({
        currentBelief: { direction: 'DOWN', confidence: 42 },
        executionAllowed: false,
        riskLevel: 'LOW',
        authority: {
          source: 'COGNITION_LAYER',
          realityValid: true,
          riskVeto: false,
          simulationPassed: false,
        },
        snapshotId: generateSnapshotId(latestTs - 10),
      });
    }, /snapshot-regression-detected/);
  });

  it('rejects invalid snapshot ids on POST', async () => {
    const body = {
      currentBelief: { direction: 'UP', confidence: 50 },
      executionAllowed: true,
      riskLevel: 'LOW',
      authority: {
        source: 'COGNITION_LAYER',
        realityValid: true,
        riskVeto: false,
        simulationPassed: true,
      },
      snapshotId: 'bad-id',
    };
    const req = mockReq({
      method: 'POST',
      body,
      headers: buildSignedHeaders(body),
    });
    const res = mockRes();

    await systemTruthHandler(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.payload.error, /snapshotId/i);
  });

  it('rejects unsigned POST requests', async () => {
    const req = mockReq({
      method: 'POST',
      body: {
        currentBelief: { direction: 'UP', confidence: 50 },
        executionAllowed: true,
        riskLevel: 'LOW',
        authority: {
          source: 'COGNITION_LAYER',
          realityValid: true,
          riskVeto: false,
          simulationPassed: true,
        },
        snapshotId: generateSnapshotId(),
      },
    });
    const res = mockRes();

    await systemTruthHandler(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.error, 'missing-auth-headers');
  });
});

describe('system truth performance memory', () => {
  beforeEach(() => {
    resetSharedState();
  });

  it('keeps only the last 50 recorded results', () => {
    for (let index = 0; index < 55; index++) {
      appendResult({
        direction: index % 2 === 0 ? 'UP' : 'DOWN',
        actual: index % 2 === 0 ? 'UP' : 'DOWN',
        confidence: 60 + (index % 20),
        riskLevel: 'LOW',
      });
    }

    assert.equal(results.length, 50);
    assert.equal(results[0].confidence, 65);
    assert.equal(results.at(-1).confidence, 74);
  });

  it('computes rolling performance windows and best risk level', () => {
    const sample = [
      { direction: 'UP', actual: 'UP', confidence: 80, riskLevel: 'LOW' },
      { direction: 'DOWN', actual: 'UP', confidence: 35, riskLevel: 'LOW' },
      { direction: 'UP', actual: 'UP', confidence: 72, riskLevel: 'MEDIUM' },
      { direction: 'DOWN', actual: 'DOWN', confidence: 68, riskLevel: 'MEDIUM' },
      { direction: 'UP', actual: 'DOWN', confidence: 25, riskLevel: 'HIGH' },
      { direction: 'DOWN', actual: 'DOWN', confidence: 61, riskLevel: 'CRITICAL' },
    ];

    const performance = computePerformance(sample);

    assert.equal(performance.winRateLast10, 66.67);
    assert.equal(performance.winRateLast50, 66.67);
    assert.equal(performance.avgConfidenceWins, 70.25);
    assert.equal(performance.avgConfidenceLosses, 30);
    assert.equal(performance.bestRiskLevel, 'MEDIUM');
    assert.deepEqual(performance.perRiskLevel.MEDIUM, {
      count: 2,
      wins: 2,
      losses: 0,
      winRate: 100,
    });
  });
});
