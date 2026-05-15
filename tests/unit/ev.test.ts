import { computeEV, computeKellyCriterion } from '../../core/decision/ev';

describe('EV Engine', () => {
  test('computeEV returns positive EV for favorable odds', () => {
    const result = computeEV({ probability: 0.6, payout: 100, loss: 100 });
    expect(result.expectedValue).toBeGreaterThan(0);
    expect(result.decision).toBe('TRADE');
  });

  test('computeEV returns negative EV for unfavorable odds', () => {
    const result = computeEV({ probability: 0.4, payout: 100, loss: 100 });
    expect(result.expectedValue).toBeLessThan(0);
    expect(result.decision).toBe('NO_TRADE');
  });

  test('computeEV edge calculation is correct', () => {
    const result = computeEV({ probability: 0.6, payout: 100, loss: 100 });
    expect(result.edge).toBeCloseTo(0.2);
  });

  test('computeKellyCriterion returns positive fraction for positive EV', () => {
    const kelly = computeKellyCriterion(20, 1, 1000);
    expect(kelly).toBeGreaterThan(0);
    expect(kelly).toBeLessThanOrEqual(250);
  });

  test('computeKellyCriterion returns 0 for negative EV', () => {
    const kelly = computeKellyCriterion(-10, 1, 1000);
    expect(kelly).toBe(0);
  });
});
