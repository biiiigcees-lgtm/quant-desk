// ╔══════════════════════════════════════════════════════════════════╗
// ║  QUANT//DESK — INTELLIGENCE ENGINE v2                          ║
// ║  Regime-aware, weighted, multi-timeframe Bayesian ensemble     ║
// ║  for Kalshi 15-min BTC ABOVE/BELOW prediction                  ║
// ╚══════════════════════════════════════════════════════════════════╝

// ─── SIGNAL WEIGHTS BY REGIME ────────────────────────────────────────
// Based on empirical performance of each signal in each regime type
// TREND: momentum/EMA signals dominate, oscillators lag
// RANGING: oscillators dominate, EMA signals whipsaw
// VOLATILE: microstructure dominates, all others noisy

const SIGNAL_WEIGHTS = {
  BULL_TREND:   { ema:0.18, macd:0.14, vwap:0.12, cvd:0.14, momentum:0.12, rsi:0.06, bb:0.05, stoch:0.04, imbalance:0.10, delta:0.05 },
  BEAR_TREND:   { ema:0.18, macd:0.14, vwap:0.12, cvd:0.14, momentum:0.12, rsi:0.06, bb:0.05, stoch:0.04, imbalance:0.10, delta:0.05 },
  RANGING:      { ema:0.05, macd:0.07, vwap:0.10, cvd:0.10, momentum:0.06, rsi:0.18, bb:0.16, stoch:0.14, imbalance:0.08, delta:0.06 },
  TRANSITIONAL: { ema:0.10, macd:0.10, vwap:0.11, cvd:0.12, momentum:0.09, rsi:0.12, bb:0.10, stoch:0.08, imbalance:0.10, delta:0.08 },
  NEUTRAL:      { ema:0.10, macd:0.10, vwap:0.11, cvd:0.12, momentum:0.09, rsi:0.12, bb:0.10, stoch:0.08, imbalance:0.10, delta:0.08 },
};

// ─── MATH UTILITIES ──────────────────────────────────────────────────

function ema(arr, p) {
  const k = 2/(p+1), res = new Array(arr.length).fill(null);
  if (arr.length < p) return res;
  let e = arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
  res[p-1] = e;
  for (let i=p; i<arr.length; i++) { e = arr[i]*k + e*(1-k); res[i]=e; }
  return res;
}

function rsi(arr, p=14) {
  if (arr.length < p+1) return 50;
  let g=0,l=0;
  for (let i=1;i<=p;i++){const d=arr[i]-arr[i-1];d>0?g+=d:l-=d;}
  let ag=g/p,al=l/p;
  for (let i=p+1;i<arr.length;i++){
    const d=arr[i]-arr[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p;
  }
  return al===0?100:100-100/(1+ag/al);
}

function slope(arr, n=6) {
  const v=arr.slice(-n).filter(x=>x!=null);
  if(v.length<2)return 0;
  const xm=(v.length-1)/2, ym=v.reduce((a,b)=>a+b,0)/v.length;
  let num=0,den=0;
  v.forEach((y,x)=>{num+=(x-xm)*(y-ym);den+=(x-xm)**2;});
  return den===0?0:num/den;
}

function stdDev(arr) {
  const m=arr.reduce((a,b)=>a+b,0)/arr.length;
  return Math.sqrt(arr.map(v=>(v-m)**2).reduce((a,b)=>a+b,0)/arr.length);
}

// ─── DIVERGENCE DETECTOR ─────────────────────────────────────────────

function detectDivergence(closes, rsiVals) {
  if (closes.length < 20 || rsiVals.filter(v=>v!=null).length < 10) return null;
  // Look at last 20 bars for price high/low vs RSI high/low
  const recent = closes.slice(-20);
  const recentRsi = rsiVals.slice(-20).filter(v=>v!=null);
  if (recentRsi.length < 10) return null;

  const priceHigh = Math.max(...recent), priceLow = Math.min(...recent);
  const rsiHigh   = Math.max(...recentRsi), rsiLow = Math.min(...recentRsi);
  const priceIdx  = recent.lastIndexOf(priceHigh);
  const priceLowIdx = recent.lastIndexOf(priceLow);

  // Bearish divergence: price making higher highs, RSI making lower highs
  const priceHigher = recent[recent.length-1] >= priceHigh * 0.995;
  const rsiLower    = recentRsi[recentRsi.length-1] <= rsiHigh * 0.95;
  if (priceHigher && rsiLower && rsiHigh > 65) return { type: 'BEARISH_DIV', strength: (rsiHigh - recentRsi[recentRsi.length-1]) / rsiHigh };

  // Bullish divergence: price making lower lows, RSI making higher lows
  const priceLower = recent[recent.length-1] <= priceLow * 1.005;
  const rsiHigher  = recentRsi[recentRsi.length-1] >= rsiLow * 1.05;
  if (priceLower && rsiHigher && rsiLow < 35) return { type: 'BULLISH_DIV', strength: (recentRsi[recentRsi.length-1] - rsiLow) / (100 - rsiLow) };

  return null;
}

// ─── CANDLE PATTERN RECOGNITION ──────────────────────────────────────

function detectCandlePattern(candles) {
  if (candles.length < 3) return null;
  const [c3, c2, c1] = candles.slice(-3);
  const body1 = Math.abs(c1.close - c1.open);
  const range1 = c1.high - c1.low;
  const body2 = Math.abs(c2.close - c2.open);
  const midC1 = (c1.open + c1.close) / 2;

  // Doji — indecision
  if (body1 < range1 * 0.1 && range1 > 0) return { type: 'DOJI', bias: 'NEUTRAL', strength: 0.5 };

  // Bullish engulfing
  if (c2.close < c2.open && c1.close > c1.open && c1.open <= c2.close && c1.close >= c2.open)
    return { type: 'BULL_ENGULF', bias: 'BULL', strength: Math.min(body1/body2, 2)/2 };

  // Bearish engulfing
  if (c2.close > c2.open && c1.close < c1.open && c1.open >= c2.close && c1.close <= c2.open)
    return { type: 'BEAR_ENGULF', bias: 'BEAR', strength: Math.min(body1/body2, 2)/2 };

  // Hammer (bullish reversal at low)
  const lowerWick1 = c1.open < c1.close ? c1.open - c1.low : c1.close - c1.low;
  const upperWick1 = c1.open > c1.close ? c1.high - c1.open : c1.high - c1.close;
  if (lowerWick1 > body1 * 2 && upperWick1 < body1 * 0.3 && c1.close > c1.open)
    return { type: 'HAMMER', bias: 'BULL', strength: 0.65 };

  // Shooting star (bearish)
  if (upperWick1 > body1 * 2 && lowerWick1 < body1 * 0.3 && c1.close < c1.open)
    return { type: 'SHOOTING_STAR', bias: 'BEAR', strength: 0.65 };

  // Three white soldiers (very bullish)
  if (c1.close>c1.open && c2.close>c2.open && c3.close>c3.open &&
      c1.close>c2.close && c2.close>c3.close && body1>0 && body2>0)
    return { type: '3_WHITE_SOLDIERS', bias: 'BULL', strength: 0.85 };

  // Three black crows (very bearish)
  if (c1.close<c1.open && c2.close<c2.open && c3.close<c3.open &&
      c1.close<c2.close && c2.close<c3.close)
    return { type: '3_BLACK_CROWS', bias: 'BEAR', strength: 0.85 };

  return null;
}

// ─── VOLUME PROFILE / POC ────────────────────────────────────────────

function computePOC(candles, bins=20) {
  if (candles.length < 5) return null;
  const prices = candles.flatMap(c=>[c.high,c.low]);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const binSize = (maxP - minP) / bins;
  if (binSize === 0) return candles[candles.length-1].close;

  const profile = new Array(bins).fill(0);
  candles.forEach(c => {
    const vol = c.volume || 0;
    const startBin = Math.floor((c.low  - minP) / binSize);
    const endBin   = Math.min(Math.floor((c.high - minP) / binSize), bins-1);
    for (let b = Math.max(0,startBin); b <= endBin; b++) {
      profile[b] += vol / (endBin - startBin + 1);
    }
  });

  const pocBin = profile.indexOf(Math.max(...profile));
  return minP + (pocBin + 0.5) * binSize;
}

// ─── VWAP BANDS ──────────────────────────────────────────────────────

function computeVWAPBands(candles) {
  if (candles.length < 5) return { vwap: 0, upper1: 0, lower1: 0, upper2: 0, lower2: 0 };
  let tv=0, tv2=0, vol=0;
  const tps = candles.map(c => ({ tp: (c.high+c.low+c.close)/3, v: c.volume||0 }));
  tps.forEach(({tp,v}) => { tv+=tp*v; tv2+=tp*tp*v; vol+=v; });
  const vwap = vol>0 ? tv/vol : candles[candles.length-1].close;
  const variance = vol>0 ? (tv2/vol) - vwap*vwap : 0;
  const sd = Math.sqrt(Math.abs(variance));
  return { vwap, upper1: vwap+sd, lower1: vwap-sd, upper2: vwap+2*sd, lower2: vwap-2*sd };
}

// ─── MULTI-TIMEFRAME REGIME ──────────────────────────────────────────

function getMultiTFRegime(candles1m, candles5m, candles15m) {
  const getRegime = (candles) => {
    if (!candles || candles.length < 22) return 'NEUTRAL';
    const closes = candles.map(c=>c.close);
    const e9a = ema(closes,9), e21a = ema(closes,21);
    const e9 = e9a[e9a.length-1], e21 = e21a[e21a.length-1];
    const price = closes[closes.length-1];
    if (!e9||!e21) return 'NEUTRAL';
    if (price>e9&&e9>e21) return 'BULL';
    if (price<e9&&e9<e21) return 'BEAR';
    return 'NEUTRAL';
  };
  const r1 = getRegime(candles1m);
  const r5 = getRegime(candles5m);
  const r15= getRegime(candles15m);
  const bullCount = [r1,r5,r15].filter(r=>r==='BULL').length;
  const bearCount = [r1,r5,r15].filter(r=>r==='BEAR').length;
  return { r1m:r1, r5m:r5, r15m:r15, bullCount, bearCount, aligned: bullCount===3||bearCount===3 };
}

// ─── EMA VELOCITY ────────────────────────────────────────────────────

function emaVelocity(e9arr, e21arr) {
  // Rate of change of the spread — acceleration or deceleration
  const recentE9  = e9arr.slice(-6).filter(v=>v!=null);
  const recentE21 = e21arr.slice(-6).filter(v=>v!=null);
  if (recentE9.length < 3 || recentE21.length < 3) return { velocity:0, accelerating:false };
  const spreads = recentE9.slice(-recentE21.length).map((v,i)=>v-recentE21[i]).filter(v=>!isNaN(v));
  if (spreads.length < 3) return { velocity:0, accelerating:false };
  const velocity = slope(spreads, spreads.length);
  const recentSlope = spreads[spreads.length-1] - spreads[spreads.length-2];
  const prevSlope   = spreads[spreads.length-2] - spreads[spreads.length-3];
  return { velocity, accelerating: Math.abs(recentSlope) > Math.abs(prevSlope) };
}

// ─── TICK DIRECTION BIAS ─────────────────────────────────────────────

function tickDirectionBias(trades) {
  if (!trades || trades.length < 10) return 0;
  const last30 = trades.slice(0,30);
  let upticks=0, downticks=0;
  for (let i=1; i<last30.length; i++) {
    if (last30[i-1].price > last30[i].price) upticks++;
    else if (last30[i-1].price < last30[i].price) downticks++;
  }
  const total = upticks+downticks;
  return total>0 ? (upticks-downticks)/total : 0;
}

// ─── TIME-TO-EXPIRY WEIGHTING ─────────────────────────────────────────

function timeToExpiryWeight(windowCloseTs) {
  // Signals matter more as expiry approaches and price is near strike
  // Returns a confidence multiplier 0.5–1.5
  if (!windowCloseTs) return 1.0;
  const secsLeft = (windowCloseTs - Date.now()) / 1000;
  if (secsLeft < 0) return 1.0;
  if (secsLeft < 60)  return 1.5;  // Last minute — high conviction window
  if (secsLeft < 180) return 1.2;  // Last 3 min — momentum confirmed
  if (secsLeft > 780) return 0.7;  // Just started — too early to call
  return 1.0;
}

// ─── MASTER WEIGHTED BAYESIAN ENSEMBLE ───────────────────────────────

export function computeWeightedVerdict(state, multiTF, fundingRate) {
  const {
    price, ema9, ema21, rsi: rsiVal, macd, macdSig, bb, vwap, stoch, momentum,
    cvd, imbalance, aggression, regime, candles, trades, atr,
    tradeDeltaBuy, tradeDeltaSell,
  } = state;

  if (!price || !candles.length) return null;

  const closes = candles.map(c=>c.close);
  const e9a  = ema(closes, 9);
  const e21a = ema(closes, 21);
  const e9   = e9a[e9a.length-1]  || ema9;
  const e21  = e21a[e21a.length-1] || ema21;
  const rsiArr = computeRSIArr(closes);

  // ── Individual signal scores (−1 to +1) ──
  const signals = {};

  // EMA: cross + spread + velocity
  const vel = emaVelocity(e9a, e21a);
  const emaScore  = e9 > e21 ? Math.min((e9-e21)/price*500 + (vel.velocity>0?0.3:0), 1)
                             : Math.max(-(e21-e9)/price*500 + (vel.velocity<0?-0.3:0), -1);
  signals.ema = emaScore;

  // MACD: value + histogram direction
  signals.macd = macd > macdSig ? Math.min((macd-macdSig)/price*2000, 1)
                                 : Math.max((macd-macdSig)/price*2000, -1);

  // VWAP + bands
  const vwapBands = computeVWAPBands(candles.slice(-20));
  const vwapScore = price > vwapBands.upper1 ? 0.8
                  : price > vwapBands.vwap   ? 0.4
                  : price < vwapBands.lower1  ? -0.8
                  : -0.4;
  signals.vwap = vwapScore;

  // CVD: absolute level + slope
  const cvdSlope = slope(candles.slice(-8).map((_,i,a)=> {
    // synthetic CVD per bar
    const c=a[i]; return c.close>=c.open?c.volume:-c.volume;
  }), 6);
  signals.cvd = Math.max(-1, Math.min(1, (cvd / ((state.volAvg||1)*50)) * 0.6 + (cvdSlope>0?0.4:-0.4)));

  // RSI: distance from 50, divergence-adjusted
  const rsiScore = (rsiVal - 50) / 50;
  const div = detectDivergence(closes, rsiArr);
  const divAdj = div ? (div.type==='BULLISH_DIV'?0.3:-0.3)*div.strength : 0;
  signals.rsi = Math.max(-1, Math.min(1, rsiScore + divAdj));

  // Bollinger: position within bands + squeeze
  const bbRange = bb.upper - bb.lower;
  const bbPos   = bbRange > 0 ? (price - bb.mid) / (bbRange/2) : 0;
  signals.bb = Math.max(-1, Math.min(1, -bbPos * 0.6)); // contrarian — OB=bearish

  // Stochastic
  signals.stoch = Math.max(-1, Math.min(1, (stoch - 50) / 50));

  // Momentum + slope
  const momScore = Math.max(-1, Math.min(1, (momentum || 0) / (price * 0.005)));
  signals.momentum = momScore;

  // Bid/ask imbalance (from live OB)
  signals.imbalance = Math.max(-1, Math.min(1, imbalance * 3));

  // Trade delta (from live WS matches)
  const totalDelta = (tradeDeltaBuy||0) + (tradeDeltaSell||0);
  const deltaScore = totalDelta>0 ? ((tradeDeltaBuy-tradeDeltaSell)/totalDelta) : 0;
  const tickBias   = tickDirectionBias(trades);
  signals.delta = Math.max(-1, Math.min(1, deltaScore*0.7 + tickBias*0.3));

  // ── Bonus signals (modify final score) ──

  // Candle pattern
  const pattern = detectCandlePattern(candles.slice(-3));
  let patternAdj = 0;
  if (pattern) patternAdj = pattern.bias==='BULL'?0.08*pattern.strength:pattern.bias==='BEAR'?-0.08*pattern.strength:0;

  // Volume POC — price vs point of control
  const poc = computePOC(candles.slice(-30));
  let pocAdj = 0;
  if (poc && price) pocAdj = price > poc ? 0.05 : -0.05;

  // Funding rate — contrarian signal
  let fundingAdj = 0;
  if (fundingRate !== null && fundingRate !== undefined) {
    if (fundingRate > 0.0003)      fundingAdj = -0.10; // longs overextended → bearish
    else if (fundingRate < -0.0001) fundingAdj =  0.10; // shorts overextended → bullish
  }

  // Multi-timeframe alignment bonus
  let mtfAdj = 0;
  if (multiTF) {
    if (multiTF.aligned && multiTF.bullCount===3) mtfAdj =  0.12;
    if (multiTF.aligned && multiTF.bearCount===3) mtfAdj = -0.12;
    else mtfAdj = (multiTF.bullCount - multiTF.bearCount) * 0.04;
  }

  // EMA velocity accelerating
  let velAdj = 0;
  if (vel.accelerating) velAdj = vel.velocity > 0 ? 0.06 : -0.06;

  // Absorption — strong reversal signal
  let absorbAdj = 0;
  if (state.absorption) {
    absorbAdj = state.absorption.type === 'SELL_ABSORBED' ? 0.10 : -0.10;
  }

  // ── Apply regime weights ──
  const weights = SIGNAL_WEIGHTS[regime] || SIGNAL_WEIGHTS.NEUTRAL;
  let weightedScore = 0;
  weightedScore += signals.ema      * weights.ema;
  weightedScore += signals.macd     * weights.macd;
  weightedScore += signals.vwap     * weights.vwap;
  weightedScore += signals.cvd      * weights.cvd;
  weightedScore += signals.momentum * weights.momentum;
  weightedScore += signals.rsi      * weights.rsi;
  weightedScore += signals.bb       * weights.bb;
  weightedScore += signals.stoch    * weights.stoch;
  weightedScore += signals.imbalance* weights.imbalance;
  weightedScore += signals.delta    * weights.delta;

  // Add bonus adjustments
  weightedScore += patternAdj + pocAdj + fundingAdj + mtfAdj + velAdj + absorbAdj;
  weightedScore  = Math.max(-1, Math.min(1, weightedScore));

  // ── Convert to probability ──
  // Sigmoid mapping: score → P(ABOVE)
  const pAbove = 1 / (1 + Math.exp(-weightedScore * 4));
  const pBelow = 1 - pAbove;

  // ── Conviction threshold ──
  // Only bet when we're sufficiently confident AND key signals agree
  const keyBull = signals.ema>0 && signals.cvd>0 && signals.delta>0;
  const keyBear = signals.ema<0 && signals.cvd<0 && signals.delta<0;
  const baseConviction = Math.abs(weightedScore);

  // Require convergence of structure + flow + momentum
  const isHighConviction = baseConviction > 0.30 && (keyBull || keyBear);

  return {
    pAbove,
    pBelow,
    verdict:    pAbove >= 0.5 ? 'ABOVE' : 'BELOW',
    confidence: Math.round(Math.max(pAbove,pBelow) * 100),
    score:      weightedScore,
    signals,
    weights:    weights,
    pattern,
    poc,
    vwapBands,
    vel,
    mtf:        multiTF,
    fundingRate,
    adjustments: { patternAdj, pocAdj, fundingAdj, mtfAdj, velAdj, absorbAdj },
    isHighConviction,
    divergence: div,
    regime,
  };
}

// Helper: compute RSI array (needed for divergence)
function computeRSIArr(closes, p=14) {
  const res = new Array(closes.length).fill(null);
  if (closes.length < p+1) return res;
  let g=0,l=0;
  for(let i=1;i<=p;i++){const d=closes[i]-closes[i-1];d>0?g+=d:l-=d;}
  let ag=g/p,al=l/p;
  res[p] = al===0?100:100-100/(1+ag/al);
  for(let i=p+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p;
    res[i]=al===0?100:100-100/(1+ag/al);
  }
  return res;
}

export { detectCandlePattern, computePOC, computeVWAPBands, emaVelocity,
         tickDirectionBias, getMultiTFRegime, timeToExpiryWeight, detectDivergence };
