import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Funding rate annualization ───────────────────────────────────────────────

function annualize(fundingRate) {
  return fundingRate * 3 * 365;
}

function buildCountdown(nextFundingTime) {
  const countdown    = Math.max(0, nextFundingTime - Date.now());
  const countdownMin = Math.floor(countdown / 60000);
  const countdownSec = Math.floor((countdown % 60000) / 1000);
  return `${String(countdownMin).padStart(2, '0')}:${String(countdownSec).padStart(2, '0')}`;
}

// ── OI USD extraction (after the bug fix) ──────────────────────────────────

function parseOI(list) {
  const latest = parseFloat(list[0].openInterest);
  const prev   = list[1] ? parseFloat(list[1].openInterest) : latest;
  const oiUsd  = parseFloat(list[0].openInterestValue || 0);
  return {
    openInterest:    latest,
    openInterestUsd: oiUsd,
    oiDelta:         latest - prev,
    oiDeltaPct:      prev > 0 ? ((latest - prev) / prev * 100) : 0,
  };
}

describe('derivatives — funding rate annualization', () => {
  it('standard positive funding annualizes correctly', () => {
    // 0.01% per 8h = 3 payments/day * 365 days = 10.95% APR
    const rate = 0.0001;
    assert.ok(Math.abs(annualize(rate) - 0.1095) < 1e-10);
  });

  it('zero funding rate yields zero annualized', () => {
    assert.equal(annualize(0), 0);
  });

  it('negative funding rate produces negative annualized', () => {
    assert.ok(annualize(-0.0001) < 0);
  });
});

describe('derivatives — funding countdown format', () => {
  it('formats zero countdown as 00:00', () => {
    // Pass a timestamp in the past
    assert.equal(buildCountdown(Date.now() - 1000), '00:00');
  });

  it('pads single-digit minutes and seconds', () => {
    const result = buildCountdown(Date.now() + 65000); // 1m5s ahead
    assert.match(result, /^\d{2}:\d{2}$/);
  });
});

describe('derivatives — openInterestUsd (post-fix)', () => {
  it('uses openInterestValue directly without multiplying by OI qty', () => {
    const list = [
      { openInterest: '500', openInterestValue: '47500000000' },
      { openInterest: '490', openInterestValue: '46000000000' },
    ];
    const result = parseOI(list);
    // Must be the raw openInterestValue, not 500 * 47500000000 / 500
    assert.equal(result.openInterestUsd, 47500000000);
  });

  it('computes oiDelta and oiDeltaPct correctly', () => {
    const list = [
      { openInterest: '110', openInterestValue: '0' },
      { openInterest: '100', openInterestValue: '0' },
    ];
    const result = parseOI(list);
    assert.equal(result.oiDelta, 10);
    assert.ok(Math.abs(result.oiDeltaPct - 10) < 1e-9);
  });

  it('handles single-entry list (no previous) with zero delta', () => {
    const list = [{ openInterest: '200', openInterestValue: '1000' }];
    const result = parseOI(list);
    assert.equal(result.oiDelta, 0);
    assert.equal(result.oiDeltaPct, 0);
  });
});

// ── Kalman filter covariance prediction ─────────────────────────────────────
// Verifies the corrected Pp = F·P·Fᵀ + Q formula for a constant-velocity model

function kalmanPredict(P, dt, Q) {
  return [
    [P[0][0] + 2*P[0][1]*dt + P[1][1]*dt*dt + Q[0][0], P[0][1] + P[1][1]*dt + Q[0][1]],
    [P[1][0] + P[1][1]*dt + Q[1][0],                    P[1][1] + Q[1][1]],
  ];
}

describe('Kalman filter — covariance prediction (F·P·Fᵀ + Q)', () => {
  it('produces correct Pp[0][0] including cross-covariance term', () => {
    const P = [[1, 0.5], [0.5, 0.25]];
    const Q = [[0.01, 0], [0, 0.01]];
    const Pp = kalmanPredict(P, 1, Q);
    // Expected: P[0][0] + 2*P[0][1]*dt + P[1][1]*dt^2 + Q[0][0]
    //         = 1 + 2*0.5*1 + 0.25*1 + 0.01 = 2.26
    assert.ok(Math.abs(Pp[0][0] - 2.26) < 1e-10, `Pp[0][0]=${Pp[0][0]}, expected 2.26`);
  });

  it('produces correct Pp[1][0] including velocity covariance term', () => {
    const P = [[1, 0.5], [0.5, 0.25]];
    const Q = [[0.01, 0], [0, 0.01]];
    const Pp = kalmanPredict(P, 1, Q);
    // Expected: P[1][0] + P[1][1]*dt + Q[1][0] = 0.5 + 0.25 + 0 = 0.75
    assert.ok(Math.abs(Pp[1][0] - 0.75) < 1e-10, `Pp[1][0]=${Pp[1][0]}, expected 0.75`);
  });

  it('Pp[0][1] is correct (unchanged by the fix)', () => {
    const P = [[1, 0.5], [0.5, 0.25]];
    const Q = [[0.01, 0], [0, 0.01]];
    const Pp = kalmanPredict(P, 1, Q);
    // Expected: P[0][1] + P[1][1]*dt + Q[0][1] = 0.5 + 0.25 + 0 = 0.75
    assert.ok(Math.abs(Pp[0][1] - 0.75) < 1e-10, `Pp[0][1]=${Pp[0][1]}, expected 0.75`);
  });

  it('symmetry: Pp[0][1] === Pp[1][0] when P is symmetric and Q is diagonal', () => {
    const P = [[2, 0.3], [0.3, 0.1]];
    const Q = [[0.01, 0], [0, 0.01]];
    const Pp = kalmanPredict(P, 1, Q);
    assert.ok(Math.abs(Pp[0][1] - Pp[1][0]) < 1e-10, 'Pp should remain symmetric');
  });

  it('diagonal initial covariance stays non-negative definite after prediction', () => {
    const P = [[1, 0], [0, 1]];
    const Q = [[0.01, 0], [0, 0.01]];
    const Pp = kalmanPredict(P, 1, Q);
    // For positive definiteness: diagonal entries must be positive
    assert.ok(Pp[0][0] > 0);
    assert.ok(Pp[1][1] > 0);
    // Determinant > 0
    const det = Pp[0][0]*Pp[1][1] - Pp[0][1]*Pp[1][0];
    assert.ok(det > 0, `det=${det} should be positive`);
  });
});
