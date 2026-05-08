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
