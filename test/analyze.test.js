import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import analyzeHandler from '../api/analyze.js';
import { generateSnapshotId, systemTruth } from '../api/system-truth.js';

function mockReq({ method = 'POST', body } = {}) {
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

function setTruth(overrides = {}) {
  systemTruth.currentBelief = overrides.currentBelief || { direction: 'UP', confidence: 80 };
  systemTruth.executionAllowed = overrides.executionAllowed ?? true;
  systemTruth.riskLevel = overrides.riskLevel || 'LOW';
  systemTruth.snapshotId = overrides.snapshotId || generateSnapshotId(Date.now());
  systemTruth.lastUpdated = overrides.lastUpdated || Date.now();
  return systemTruth.snapshotId;
}

describe('/api/analyze execution gate', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    setTruth();
  });

  it('blocks immediately when risk level is HIGH', async () => {
    const snapshotId = setTruth({ riskLevel: 'HIGH', executionAllowed: true });
    const req = mockReq({
      body: {
        prompt: 'ignored',
        snapshotId,
        snapshotTimestamp: Date.now(),
      },
    });
    const res = mockRes();

    await analyzeHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.blocked, true);
    assert.equal(res.payload.executionAllowed, false);
    assert.match(res.payload.reason, /Risk level too high/);
  });

  it('blocks immediately when executionAllowed is false even without an API key', async () => {
    const snapshotId = setTruth({ riskLevel: 'LOW', executionAllowed: false });
    const req = mockReq({
      body: {
        prompt: 'ignored',
        snapshotId,
        snapshotTimestamp: Date.now(),
      },
    });
    const res = mockRes();

    await analyzeHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.blocked, true);
    assert.match(res.payload.reason, /Execution disabled by system truth/);
  });

  it('rejects stale snapshots older than five seconds before any AI call', async () => {
    const snapshotId = setTruth({ riskLevel: 'LOW', executionAllowed: true });
    const req = mockReq({
      body: {
        prompt: 'analyze this',
        snapshotId,
        snapshotTimestamp: Date.now() - 6001,
      },
    });
    const res = mockRes();

    await analyzeHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.stale, true);
    assert.match(res.payload.reason, /Snapshot too old/);
  });

  it('rejects snapshot id mismatches against the current truth state', async () => {
    setTruth({ riskLevel: 'LOW', executionAllowed: true, snapshotId: generateSnapshotId(1760000000000) });
    const req = mockReq({
      body: {
        prompt: 'analyze this',
        snapshotId: generateSnapshotId(1760000001000),
        snapshotTimestamp: Date.now(),
      },
    });
    const res = mockRes();

    await analyzeHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.stale, true);
    assert.match(res.payload.reason, /Snapshot mismatch/);
  });

  it('only checks the API key after passing the truth and snapshot gates', async () => {
    const snapshotId = setTruth({ riskLevel: 'LOW', executionAllowed: true });
    const req = mockReq({
      body: {
        prompt: 'analyze this',
        snapshotId,
        snapshotTimestamp: Date.now(),
      },
    });
    const res = mockRes();

    await analyzeHandler(req, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.payload.error, /OPENROUTER_API_KEY/);
  });
});
