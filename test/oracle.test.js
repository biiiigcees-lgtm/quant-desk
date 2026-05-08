import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Median helper (extracted from api/oracle.js logic) ──────────────────────

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
}

function computeOracle(mids) {
  const med = median(mids);
  const tagged = mids.map(mid => ({
    mid,
    deviation: Math.abs(mid - med) / med * 100,
    outlier: Math.abs(mid - med) / med > 0.003,
  }));
  const clean = tagged.filter(r => !r.outlier);
  const composite = clean.length > 0
    ? clean.reduce((a, r) => a + r.mid, 0) / clean.length
    : med;
  const maxDev = Math.max(...tagged.map(r => r.deviation), 0);
  const confidence = Math.round(Math.max(0, Math.min(100, 100 - maxDev * 100)));
  return { composite, confidence, tagged };
}

describe('oracle — median price', () => {
  it('returns median of odd-length array', () => {
    assert.equal(median([1, 3, 2]), 2);
  });

  it('returns average of two middle values for even-length array', () => {
    assert.equal(median([10, 20, 30, 40]), 25);
  });

  it('handles single-value array', () => {
    assert.equal(median([42000]), 42000);
  });
});

describe('oracle — composite price and outlier detection', () => {
  it('excludes outlier sources >0.3% from median', () => {
    // Three sources clustered at 100k, one outlier at 105k (5% away)
    const { composite, tagged } = computeOracle([100000, 100010, 99990, 105000]);
    assert.equal(tagged[3].outlier, true);
    // Composite should be near 100000, not pulled toward 105000
    assert.ok(composite < 100100, `composite ${composite} should be near 100000`);
  });

  it('uses median fallback when all sources are outliers', () => {
    // All spread >0.3% from each other — can happen with volatile data
    const { composite, tagged } = computeOracle([100000, 103000]);
    const med = median([100000, 103000]);
    // Both are 1.5% from median, both flagged outlier, fallback to median
    assert.equal(tagged.every(t => t.outlier), true);
    assert.equal(composite, med);
  });

  it('computes 100% confidence when all sources agree exactly', () => {
    const { confidence } = computeOracle([50000, 50000, 50000]);
    assert.equal(confidence, 100);
  });

  it('confidence decreases as deviation increases', () => {
    const { confidence: c1 } = computeOracle([50000, 50001]);
    const { confidence: c2 } = computeOracle([50000, 50500]);
    assert.ok(c1 > c2, `c1=${c1} should be greater than c2=${c2}`);
  });
});
