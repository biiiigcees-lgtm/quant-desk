const { beforeEach, describe, it } = await import('node:test');
const { default: assert } = await import('node:assert/strict');

import systemTruthHandler, {
  appendResult,
  computePerformance,
  generateSnapshotId,
  getSystemTruth,
  results,
  systemTruth,
  updateSystemTruth,
} from '../api/system-truth.js';

function mockReq({ method = 'GET', body } = {}) {
  return { method, body };
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
  systemTruth.snapshotId = generateSnapshotId();
  systemTruth.lastUpdated = Date.now();
  results.length = 0;
}

describe('system truth state', () => {
  beforeEach(() => {
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
      snapshotId: generateSnapshotId(1760000000100),
    });

    assert.equal(next.currentBelief.direction, 'UP');
    assert.equal(next.executionAllowed, true);
    assert.equal(next.riskLevel, 'LOW');
    assert.ok(next.lastUpdated >= before);
    assert.deepEqual(getSystemTruth(), next);
  });

  it('rejects invalid snapshot ids on POST', async () => {
    const req = mockReq({
      method: 'POST',
      body: {
        currentBelief: { direction: 'UP', confidence: 50 },
        executionAllowed: true,
        riskLevel: 'LOW',
        snapshotId: 'bad-id',
      },
    });
    const res = mockRes();

    await systemTruthHandler(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.payload.error, /snapshotId/i);
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
