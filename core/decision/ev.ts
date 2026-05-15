export interface EVInput {
  probability: number;
  payout: number;
  loss: number;
}

export interface EVOutput {
  expectedValue: number;
  decision: 'TRADE' | 'NO_TRADE';
  edge: number;
}

export function computeEV(input: EVInput): EVOutput {
  const { probability, payout, loss } = input;
  
  // EV = (probability * payout) - ((1 - probability) * loss)
  const expectedValue = (probability * payout) - ((1 - probability) * loss);
  
  const decision = expectedValue > 0 ? 'TRADE' : 'NO_TRADE';
  const edge = expectedValue / loss; // Edge as percentage of risk
  
  return {
    expectedValue,
    decision,
    edge,
  };
}

export function computeKellyCriterion(ev: number, odds: number, bankroll: number): number {
  if (odds <= 0 || ev <= 0) return 0;
  
  // Kelly = (bp - q) / b
  // where b = odds, p = win probability, q = lose probability
  const winProb = (ev + odds) / (2 * odds);
  const loseProb = 1 - winProb;
  
  const kelly = (odds * winProb - loseProb) / odds;
  
  // Cap at 25% of bankroll
  return Math.max(0, Math.min(kelly, 0.25)) * bankroll;
}
