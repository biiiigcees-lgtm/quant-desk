'use client';

import { useState } from 'react';
import { cx } from '../lib/cx';
import type { SystemStateSnapshot, ParticipantType } from '../lib/types';
import { SEVERITY_COLOR } from '../lib/tokens';
import { leftPctClass, widthPctClass } from '../lib/visual';

interface Props { state: SystemStateSnapshot | null }
type MetricTone = 'green' | 'yellow' | 'red';
type DecisionTone = 'green' | 'red' | 'neutral';

// ─── Mobile Content (scrollable sections) ─────────────────────────────────────

export function MobileContent({ state }: Readonly<Props>) {
  return (
    <div className="flex flex-col">
      <PriceChartSection state={state} />
      <DecisionSection state={state} />
      <MarketStateSection state={state} />
      <CollapsibleSection title="participant flow & orderbook" defaultOpen>
        <FlowSection state={state} />
      </CollapsibleSection>
      <CollapsibleSection title="calibration & cognition" defaultOpen={false}>
        <CognitionSection state={state} />
      </CollapsibleSection>
    </div>
  );
}

// ─── 1. Price Chart ────────────────────────────────────────────────────────────

function PriceChartSection({ state }: Readonly<Props>) {
  const prob = state?.probability;
  const estProb = prob?.estimatedProbability ?? 0;
  const mktProb = prob?.marketImpliedProbability ?? 0;
  const edge = prob?.edge ?? 0;

  const history = Array.from({ length: 30 }, (_, i) => ({
    t: i,
    v: Math.max(0, Math.min(1, estProb + Math.sin(i * 0.4) * 0.03)),
  }));

  return (
    <section className="px-4 pt-3 pb-2 panel-border shrink-0">
      <div className="flex items-center justify-between mb-1">
        <span className="panel-header">kalshi implied</span>
        <span className="font-mono text-xs text-primary">{(mktProb * 100).toFixed(1)}%</span>
      </div>
      <ProbabilitySparkline data={history} />
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        <MobileProbBar label="SYS" value={estProb} fillClass="bg-secondary" />
        <MobileProbBar label="MKT" value={mktProb} fillClass="bg-green" />
        <span className={cx(
          'ml-auto font-mono text-xs font-semibold',
          signedToneClass(edge, 'text-muted'),
        )}>
          {edge > 0 ? '+' : ''}{(edge * 100).toFixed(2)}% edge
        </span>
      </div>
    </section>
  );
}

function ProbabilitySparkline({ data }: Readonly<{ data: Array<{ t: number; v: number }> }>) {
  if (data.length < 2) return <div className="w-full h-16 bg-elevated rounded" />;
  const last = data.length - 1;
  const pts = data.map((p, i) =>
    `${((i / last) * 100).toFixed(2)},${((1 - p.v) * 100).toFixed(2)}`
  ).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-16">
      <defs>
        <linearGradient id="mobGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#9CA3AF" stopOpacity="0.16" />
          <stop offset="95%" stopColor="#9CA3AF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${pts} 100,100`} fill="url(#mobGrad)" />
      <polyline points={pts} fill="none" stroke="#9CA3AF" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MobileProbBar({ label, value, fillClass }: Readonly<{ label: string; value: number; fillClass: string }>) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-2xs text-muted w-6">{label}</span>
      <div className="w-20 h-1.5 bg-elevated rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full transition-calm', widthPctClass(value), fillClass)} />
      </div>
      <span className="font-mono text-2xs text-primary">{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

// ─── 2. Decision Panel ─────────────────────────────────────────────────────────

function DecisionSection({ state }: Readonly<Props>) {
  const prob = state?.probability;
  const reality = state?.realitySnapshot;
  const epistemicHealth = state?.epistemicHealth;
  const estProb = prob?.estimatedProbability ?? 0;
  const ciLow = prob?.confidenceInterval?.[0] ?? estProb;
  const ciHigh = prob?.confidenceInterval?.[1] ?? estProb;
  const edge = prob?.edge ?? 0;
  const uncertainty = prob?.uncertaintyScore ?? 0;
  const edgeScore = Math.round(Math.min(100, Math.abs(edge) * 1000));
  const truthScore = reality?.truthScore ?? 0;
  const ehScore = epistemicHealth?.epistemicHealthScore ?? 0;
  const probColor = signedToneClass(edge, 'text-primary', 0.01);
  const edgeTone = bandToneClass(edgeScore, 40, 20);
  const uncertaintyTone = reverseBandToneClass(uncertainty, 0.3, 0.6);
  const truthTone = bandToneClass(truthScore, 0.7, 0.4);
  const ehFillClass = bandFillClass(ehScore, 0.7, 0.4);

  return (
    <section className="px-4 py-4 panel-border shrink-0">
      <span className="panel-header block mb-2">estimated probability</span>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={cx('font-mono text-5xl font-semibold leading-none', probColor)}>
          {(estProb * 100).toFixed(1)}
        </span>
        <span className="font-mono text-2xl text-muted">%</span>
      </div>
      <div className="font-mono text-2xs text-muted mb-3">
        CI [{(ciLow * 100).toFixed(1)} — {(ciHigh * 100).toFixed(1)}]
      </div>
      {/* CI bar */}
      <div className="relative w-full h-1 bg-elevated rounded-full mb-4">
        <div
          className={cx(
            'absolute h-1 rounded-full opacity-25 bg-secondary transition-calm',
            leftPctClass(ciLow),
            widthPctClass(ciHigh - ciLow),
          )}
        />
        <div
          className={cx(
            'absolute w-2.5 h-2.5 rounded-full -top-[3px] -translate-x-1/2 bg-primary transition-calm',
            leftPctClass(estProb),
          )}
        />
      </div>
      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <MobileMetric
          label="edge score"
          value={`${edgeScore}/100`}
          tone={edgeTone}
        />
        <MobileMetric
          label="uncertainty"
          value={`${(uncertainty * 100).toFixed(0)}%`}
          tone={uncertaintyTone}
        />
        <MobileMetric
          label="truth score"
          value={`${(truthScore * 100).toFixed(0)}%`}
          tone={truthTone}
        />
      </div>
      {/* Epistemic health */}
      {epistemicHealth && (
        <div className="flex items-center gap-2">
          <span className="panel-header shrink-0">epistemic health</span>
          <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
            <div className={cx(
              'h-full rounded-full transition-calm',
              widthPctClass(ehScore),
              ehFillClass,
            )} />
          </div>
          <span className={cx(
            'font-mono text-xs font-bold px-1 py-0.5 rounded border shrink-0',
            gradeClass(epistemicHealth.healthGrade),
          )}>
            {epistemicHealth.healthGrade}
          </span>
        </div>
      )}
    </section>
  );
}

function MobileMetric({ label, value, tone }: Readonly<{
  label: string; value: string; tone: MetricTone;
}>) {
  const toneClass = toneTextClass(tone);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="panel-header">{label}</span>
      <span className={cx('font-mono text-sm font-semibold', toneClass)}>{value}</span>
    </div>
  );
}

// ─── 3. Market State ───────────────────────────────────────────────────────────

function MarketStateSection({ state }: Readonly<Props>) {
  const prob = state?.probability;
  const drift = state?.drift;
  const anomaly = state?.anomaly;
  const reality = state?.realitySnapshot;
  const physics = state?.marketPhysics;
  const meta = state?.metaCalibration;
  const obiValue = (reality?.beliefFactor ?? 0.5) * 2 - 1;

  return (
    <section className="px-4 py-3 panel-border shrink-0">
      <span className="panel-header block mb-2">market state</span>
      <div className="flex flex-wrap gap-2 mb-3">
        <RegimeBadge label="drift" value={drift?.severity ?? 'none'} color={SEVERITY_COLOR[drift?.severity ?? 'none'] ?? '#6B7C93'} />
        <RegimeBadge label="anomaly" value={anomaly?.severity ?? 'none'} color={SEVERITY_COLOR[anomaly?.severity ?? 'none'] ?? '#6B7C93'} />
        <RegimeBadge label="regime" value={prob?.regime ?? '—'} color="#F59E0B" />
        <RegimeBadge
          label="meta"
          value={`${((meta?.compositeScore ?? 0) * 100).toFixed(0)}%`}
          color={metaCompositeColor(meta?.compositeScore ?? 0)}
        />
      </div>
      <div className="space-y-1.5">
        <MobileHeatRow label="OBI" value={Math.abs(obiValue)} bullish={obiValue >= 0} />
        <MobileHeatRow label="SPREAD" value={prob?.calibrationError ?? 0} bullish={false} />
        <MobileHeatRow label="SWEEP" value={prob?.uncertaintyScore ?? 0} bullish={(prob?.uncertaintyScore ?? 1) < 0.5} />
        <MobileHeatRow label="STRESS" value={physics?.structuralStress ?? 0} bullish={false} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-2xs text-muted">uncertainty state</span>
        <span className={cx(
          'font-mono text-xs font-semibold',
          uncertaintyStateClass(reality?.uncertaintyState),
        )}>
          {reality?.uncertaintyState ?? '—'}
        </span>
      </div>
    </section>
  );
}

function RegimeBadge({ label, value, color }: Readonly<{ label: string; value: string; color: string }>) {
  const toneClass = toneClassByColor(color);
  return (
    <div className="flex flex-col items-center px-2 py-1 rounded bg-elevated gap-0.5 min-w-[3rem]">
      <span className="panel-header">{label}</span>
      <span className={cx('font-mono text-2xs font-semibold uppercase', toneClass)}>{value}</span>
    </div>
  );
}

function MobileHeatRow({ label, value, bullish }: Readonly<{ label: string; value: number; bullish: boolean }>) {
  const cells = Math.round(Math.max(0, Math.min(1, value)) * 10);
  const fill = bullish ? 'bg-green' : 'bg-red';
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-2xs text-muted w-14 shrink-0">{label}</span>
      <div className="flex-1 grid grid-cols-10 gap-px h-2.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={cx('rounded-sm', i < cells ? fill : 'bg-border opacity-30')} />
        ))}
      </div>
      <span className="font-mono text-2xs text-primary w-8 text-right">{(value * 100).toFixed(0)}</span>
    </div>
  );
}

// ─── 4. Flow Section ──────────────────────────────────────────────────────────

function FlowSection({ state }: Readonly<Props>) {
  const pf = state?.participantFlow;
  if (!pf) {
    return <p className="px-4 py-3 font-mono text-2xs text-muted">awaiting participant flow data…</p>;
  }
  const types: ParticipantType[] = ['liquidity-provider', 'momentum', 'panic-flow', 'arbitrage', 'trapped-trader'];

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cx('text-2xs font-mono font-semibold uppercase px-2 py-0.5 rounded border', participantPill(pf.dominant))}>
          {pf.dominant}
        </span>
        {pf.trappedTraderSignal && (
          <span className="font-mono text-2xs text-yellow">⚠ trapped signal</span>
        )}
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {types.map((t) => (
          <div
            key={t}
            className={cx(widthPctClass(pf.distribution[t] ?? 0), participantFill(t))}
            title={`${t}: ${((pf.distribution[t] ?? 0) * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="panel-header">aggression index</span>
        <span className="font-mono text-xs text-primary">{(pf.aggressionIndex * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ─── 5. Cognition Section ─────────────────────────────────────────────────────

function CognitionSection({ state }: Readonly<Props>) {
  const adversarialAudit = state?.adversarialAudit;
  const causalInsights = state?.causalInsights ?? [];
  const marketCausalState = state?.marketCausalState;
  const calibration = state?.calibration;
  const drift = state?.drift;
  const reality = state?.realitySnapshot;

  return (
    <div className="px-4 py-3 space-y-3">
      <div>
        <span className="panel-header block mb-2">uncertainty decomposition</span>
        <div className="grid grid-cols-2 gap-2">
          <CompactCell label="calibration" value={1 - (calibration?.ece ?? 0)} />
          <CompactCell label="drift PSI" value={1 - (drift?.psi ?? 0)} />
          <CompactCell label="anomaly" value={state?.anomaly ? 0 : 1} />
          <CompactCell label="belief" value={reality?.beliefFactor ?? 0} />
        </div>
      </div>
      {adversarialAudit && adversarialAudit.adversarialScore > 0.5 && (
        <div className="p-2 rounded border border-red bg-elevated">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-2xs font-bold text-red uppercase">adversarial risk</span>
            <span className="font-mono text-2xs text-muted">{(adversarialAudit.adversarialScore * 100).toFixed(0)}%</span>
          </div>
          <p className="font-mono text-2xs text-secondary line-clamp-2">{adversarialAudit.counterNarrative}</p>
        </div>
      )}
      {causalInsights.length > 0 && (
        <div>
          <span className="panel-header block mb-1.5">top causal drivers</span>
          <div className="space-y-1">
            {causalInsights.slice(0, 3).map((insight) => (
              <div
                key={`${insight.cause}-${insight.effect}-${insight.timestamp}`}
                className="flex items-center gap-2 px-2 py-1 rounded bg-elevated font-mono text-2xs"
              >
                <span className="text-yellow truncate">{insight.cause.split(':')[1] ?? insight.cause}</span>
                <span className="text-muted shrink-0">→</span>
                <span className="text-secondary truncate">{insight.effect.split(':')[1] ?? insight.effect}</span>
                <div className="flex-1 h-1 bg-border rounded-full overflow-hidden shrink-0 w-10">
                  <div className={cx('h-full rounded-full bg-secondary transition-calm', widthPctClass(insight.causalStrength))} />
                </div>
                <span className="text-primary shrink-0">{(insight.causalStrength * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {marketCausalState && (
        <div className="p-2 rounded bg-elevated">
          <div className="flex items-center justify-between gap-2">
            <span className={cx('font-mono text-2xs font-semibold uppercase', hiddenStateClass(marketCausalState.hiddenState))}>
              {marketCausalState.hiddenState}
            </span>
            <span className="font-mono text-2xs text-muted">
              conf {(marketCausalState.confidence * 100).toFixed(0)}% | risk {(marketCausalState.instabilityRisk * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactCell({ label, value }: Readonly<{ label: string; value: number }>) {
  const v = Math.max(0, Math.min(1, value));
  const fill = bandFillClass(v, 0.7, 0.4);
  const text = bandTextClass(v, 0.7, 0.4);
  return (
    <div className="bg-elevated rounded p-2 flex flex-col gap-1">
      <span className="panel-header">{label}</span>
      <div className="w-full h-1 bg-border rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full', widthPctClass(v), fill)} />
      </div>
      <span className={cx('font-mono text-2xs', text)}>{(v * 100).toFixed(0)}%</span>
    </div>
  );
}

// ─── Collapsible Section ───────────────────────────────────────────────────────

function CollapsibleSection({
  title, defaultOpen = true, children,
}: Readonly<{ title: string; defaultOpen?: boolean; children: React.ReactNode }>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel-border">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 shrink-0 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="panel-header">{title}</span>
        <span className="font-mono text-xs text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && children}
    </section>
  );
}

// ─── Mobile Decision Bar ───────────────────────────────────────────────────────

export function MobileDecisionBar({ state }: Readonly<Props>) {
  const signal = state?.signal;
  const prob = state?.probability;
  const edge = prob?.edge ?? 0;
  const estProb = prob?.estimatedProbability ?? 0;
  const direction = signal?.direction ?? 'FLAT';
  const ts = state?.probability?.timestamp;
  const ageMs = ts ? Math.max(0, Date.now() - ts) : null;

  let latencyLabel = '';
  if (ageMs !== null) {
    if (ageMs < 1000) latencyLabel = `${ageMs}ms`;
    else if (ageMs < 60000) latencyLabel = `${(ageMs / 1000).toFixed(1)}s`;
    else latencyLabel = 'stale';
  }

  return (
    <div className="shrink-0 bg-surface border-t border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <DecisionButton label="ABOVE" active={direction === 'YES'} tone="green" />
        <DecisionButton label="NO BET" active={direction === 'FLAT'} tone="neutral" />
        <DecisionButton label="BELOW" active={direction === 'NO'} tone="red" />
        <div className="ml-2 flex flex-col items-end gap-0.5 shrink-0">
          <span className={cx(
            'font-mono text-xs font-semibold',
            signedToneClass(edge, 'text-muted'),
          )}>
            {edge > 0 ? '+' : ''}{(edge * 100).toFixed(2)}%
          </span>
          <span className="font-mono text-2xs text-muted">
            {estProb > 0 ? `p=${(estProb * 100).toFixed(1)}%` : '—'}
            {latencyLabel ? ` · ${latencyLabel}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

function DecisionButton({ label, active, tone }: Readonly<{
  label: string; active: boolean; tone: DecisionTone;
}>) {
  const activeClass = decisionToneClass(tone, true);
  const inactiveClass = decisionToneClass(tone, false);
  return (
    <div className={cx(
      'flex-1 text-center font-mono text-xs uppercase py-2 rounded border transition-calm',
      active ? activeClass : inactiveClass,
    )}>
      {label}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function gradeClass(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green border-current';
    case 'B': return 'text-secondary border-current';
    case 'C': return 'text-yellow border-current';
    default:  return 'text-red border-current';
  }
}

function hiddenStateClass(state: string): string {
  switch (state) {
    case 'momentum-continuation':   return 'text-green';
    case 'liquidity-fragility':     return 'text-yellow';
    case 'panic-feedback':          return 'text-red';
    case 'mean-reversion-pressure': return 'text-secondary';
    default:                        return 'text-neutral';
  }
}

function participantPill(t: ParticipantType): string {
  switch (t) {
    case 'liquidity-provider': return 'text-green border-green/30';
    case 'momentum':           return 'text-secondary border-secondary/30';
    case 'panic-flow':         return 'text-red border-red/30';
    case 'arbitrage':          return 'text-yellow border-yellow/30';
    default:                   return 'text-yellow border-yellow/30';
  }
}

function participantFill(t: ParticipantType): string {
  switch (t) {
    case 'liquidity-provider': return 'bg-green';
    case 'momentum':           return 'bg-secondary';
    case 'panic-flow':         return 'bg-red';
    case 'arbitrage':          return 'bg-yellow';
    default:                   return 'bg-yellow';
  }
}

function toneTextClass(tone: MetricTone): string {
  switch (tone) {
    case 'green': return 'text-green';
    case 'yellow': return 'text-yellow';
    default: return 'text-red';
  }
}

function bandToneClass(value: number, high: number, medium: number): MetricTone {
  if (value > high) return 'green';
  if (value > medium) return 'yellow';
  return 'red';
}

function reverseBandToneClass(value: number, low: number, medium: number): MetricTone {
  if (value < low) return 'green';
  if (value < medium) return 'yellow';
  return 'red';
}

function bandFillClass(value: number, high: number, medium: number): string {
  const tone = bandToneClass(value, high, medium);
  if (tone === 'green') return 'bg-green';
  if (tone === 'yellow') return 'bg-yellow';
  return 'bg-red';
}

function bandTextClass(value: number, high: number, medium: number): string {
  const tone = bandToneClass(value, high, medium);
  return toneTextClass(tone);
}

function signedToneClass(value: number, neutralClass: string, deadzone = 0): string {
  if (value > deadzone) return 'text-green';
  if (value < -deadzone) return 'text-red';
  return neutralClass;
}

function metaCompositeColor(value: number): string {
  if (value > 0.7) return '#22C55E';
  if (value > 0.45) return '#F59E0B';
  return '#EF4444';
}

function uncertaintyStateClass(state: string | undefined): string {
  switch (state) {
    case 'extreme': return 'text-red';
    case 'high': return 'text-yellow';
    default: return 'text-green';
  }
}

function toneClassByColor(color: string): string {
  switch (color) {
    case '#22C55E': return 'text-green';
    case '#F59E0B': return 'text-yellow';
    case '#EF4444': return 'text-red';
    default: return 'text-neutral';
  }
}

function decisionToneClass(tone: DecisionTone, active: boolean): string {
  if (active) {
    switch (tone) {
      case 'green': return 'bg-green text-base border-green font-bold';
      case 'red': return 'bg-red text-base border-red font-bold';
      default: return 'bg-elevated text-primary border-border font-bold';
    }
  }

  switch (tone) {
    case 'green': return 'text-green border-green/30 bg-elevated';
    case 'red': return 'text-red border-red/30 bg-elevated';
    default: return 'text-neutral border-border bg-elevated';
  }
}
