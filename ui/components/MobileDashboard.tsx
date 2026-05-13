'use client';

import type { SystemStateSnapshot } from '../lib/types';
import { cx } from '../lib/cx';
import { widthPctClass } from '../lib/visual';
import { MobileCollapsible } from './MobileCollapsible';

interface Props {
  state: SystemStateSnapshot | null;
}

export function MobileDashboard({ state }: Readonly<Props>) {
  const prob = state?.probability;
  const reality = state?.realitySnapshot;
  const calibration = state?.calibration;
  const participant = state?.participantFlow;
  const physics = state?.marketPhysics;

  const estProb = prob?.estimatedProbability ?? 0;
  const marketProb = prob?.marketImpliedProbability ?? 0;
  const uncertainty = prob?.uncertaintyScore ?? 1;
  const confidence = Math.max(0, Math.min(1, 1 - uncertainty));

  const chartPoints = buildChartSeries(estProb);

  const decision = deriveDecision(estProb, prob?.edge ?? 0);

  const syntheticBidPressure = clamp01((reality?.beliefFactor ?? 0.5) * 0.8 + (1 - (prob?.calibrationError ?? 0.2)) * 0.2);
  const syntheticAskPressure = clamp01(1 - syntheticBidPressure);
  const syntheticSpread = clamp01((prob?.calibrationError ?? 0) * 1.2);
  const syntheticDepth = clamp01(1 - (physics?.structuralStress ?? 0));

  return (
    <div className="flex flex-col gap-2">
      <section className="rounded border border-border bg-surface p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="panel-header">price chart</span>
          <span className="font-mono text-xs text-primary">{(estProb * 100).toFixed(1)}%</span>
        </div>
        <ProbabilityChart data={chartPoints} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MiniStat label="sys" value={`${(estProb * 100).toFixed(1)}%`} tone="text-blue" />
          <MiniStat label="mkt" value={`${(marketProb * 100).toFixed(1)}%`} tone="text-green" />
        </div>
      </section>

      <section className="rounded border border-border bg-surface p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="panel-header">p(above / below / no bet)</span>
          <span className={cx('font-mono text-xs font-semibold uppercase', decision.tone)}>{decision.label}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DecisionCell label="above" value={estProb} active={decision.label === 'above'} tone="text-green" />
          <DecisionCell label="below" value={1 - estProb} active={decision.label === 'below'} tone="text-red" />
          <DecisionCell label="no bet" value={Math.max(0, Math.min(1, uncertainty))} active={decision.label === 'no bet'} tone="text-neutral" />
        </div>
      </section>

      <section className="rounded border border-border bg-surface p-3">
        <span className="panel-header block mb-2">market state summary</span>
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="liquidity" value={`${(syntheticDepth * 100).toFixed(0)}%`} tone={toneByValue(syntheticDepth)} />
          <MiniStat label="flow" value={participant?.dominant ?? 'neutral'} tone="text-secondary" />
          <MiniStat label="aggression" value={`${((participant?.aggressionIndex ?? 0) * 100).toFixed(0)}%`} tone={toneByValue(participant?.aggressionIndex ?? 0)} />
          <MiniStat label="truth" value={`${((reality?.truthScore ?? 0) * 100).toFixed(0)}%`} tone={toneByValue(reality?.truthScore ?? 0)} />
        </div>
      </section>

      <MobileCollapsible title="orderbook snapshot (synthetic)" defaultOpen={false}>
        <div className="space-y-2">
          <BarRow label="bid pressure" value={syntheticBidPressure} fillClass="bg-green" />
          <BarRow label="ask pressure" value={syntheticAskPressure} fillClass="bg-red" />
          <BarRow label="spread stress" value={syntheticSpread} fillClass="bg-yellow" />
          <BarRow label="depth stability" value={syntheticDepth} fillClass="bg-blue" />
        </div>
      </MobileCollapsible>

      <MobileCollapsible title="calibration + confidence" defaultOpen={false}>
        <div className="space-y-2">
          <BarRow label="confidence" value={confidence} fillClass={fillByValue(confidence)} />
          <BarRow label="ece health" value={clamp01(1 - (calibration?.ece ?? 0))} fillClass="bg-green" />
          <BarRow label="brier health" value={clamp01(1 - (calibration?.brier ?? 0))} fillClass="bg-blue" />
          <BarRow label="uncertainty" value={uncertainty} fillClass="bg-yellow" />
        </div>
      </MobileCollapsible>
    </div>
  );
}

function ProbabilityChart({ data }: Readonly<{ data: Array<{ x: number; y: number }> }>) {
  if (data.length < 2) {
    return <div className="h-24 w-full rounded bg-elevated" />;
  }

  const points = data.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const area = `0,100 ${points} 100,100`;

  return (
    <div className="w-full overflow-hidden rounded bg-elevated/30">
      <svg viewBox="0 0 100 100" className="h-24 w-full">
        <defs>
          <linearGradient id="mobileChartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00E5A8" stopOpacity="0.35" />
            <stop offset="95%" stopColor="#00E5A8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#mobileChartGradient)" />
        <polyline points={points} fill="none" stroke="#00E5A8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function DecisionCell({ label, value, active, tone }: Readonly<{ label: string; value: number; active: boolean; tone: string }>) {
  return (
    <div className={cx('rounded border border-border p-2', active ? 'bg-elevated' : 'bg-base')}>
      <span className="panel-header block mb-0.5">{label}</span>
      <span className={cx('font-mono text-sm font-semibold', tone)}>{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

function MiniStat({ label, value, tone }: Readonly<{ label: string; value: string; tone: string }>) {
  return (
    <div className="rounded bg-elevated px-2 py-1.5">
      <span className="panel-header block">{label}</span>
      <span className={cx('font-mono text-xs font-semibold', tone)}>{value}</span>
    </div>
  );
}

function BarRow({ label, value, fillClass }: Readonly<{ label: string; value: number; fillClass: string }>) {
  const clamped = clamp01(value);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-2xs text-muted">{label}</span>
        <span className="font-mono text-2xs text-primary">{(clamped * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-base overflow-hidden">
        <div className={cx('h-full rounded-full', widthPctClass(clamped), fillClass)} />
      </div>
    </div>
  );
}

function deriveDecision(probability: number, edge: number): { label: 'above' | 'below' | 'no bet'; tone: string } {
  if (probability >= 0.55 && edge > 0) {
    return { label: 'above', tone: 'text-green' };
  }
  if (probability <= 0.45 && edge < 0) {
    return { label: 'below', tone: 'text-red' };
  }
  return { label: 'no bet', tone: 'text-neutral' };
}

function buildChartSeries(seed: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 40 }, (_, i) => {
    const x = (i / 39) * 100;
    const value = clamp01(seed + Math.sin(i * 0.4) * 0.045 + Math.cos(i * 0.18) * 0.012);
    return { x, y: (1 - value) * 100 };
  });
}

function toneByValue(value: number): string {
  if (value > 0.7) {
    return 'text-green';
  }
  if (value > 0.4) {
    return 'text-yellow';
  }
  return 'text-red';
}

function fillByValue(value: number): string {
  if (value > 0.7) {
    return 'bg-green';
  }
  if (value > 0.4) {
    return 'bg-yellow';
  }
  return 'bg-red';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
