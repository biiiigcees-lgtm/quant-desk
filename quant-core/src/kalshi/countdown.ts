export function getNext15mTimestamp(): number {
  const now = Date.now();
  const minutes = Math.floor(now / 60000);
  const next15m = (minutes + 15 - (minutes % 15)) * 60000;
  return next15m;
}

export function estimateKalshiTarget({
  currentPrice,
  targetPrice,
  volatility,
  timeRemainingMs,
}: {
  currentPrice: number;
  targetPrice: number;
  volatility: number;
  timeRemainingMs: number;
}): { probability: number } {
  const timeMin = timeRemainingMs / 60000;
  const distance = Math.abs(targetPrice - currentPrice);
  const baseProb = Math.exp(-distance / (volatility * Math.sqrt(timeMin) + 1));
  const prob = Math.min(1, Math.max(0, baseProb));
  return { probability: prob * 100 };
}
