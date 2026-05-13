'use client';

import { cx } from '../../lib/cx';
import type { SystemStateSnapshot, ParticipantType } from '../../lib/types';
import { SEVERITY_COLOR } from '../../lib/tokens';
import { heatOpacityClass, widthPctClass } from '../../lib/visual';

interface Props { state: SystemStateSnapshot | null }

// Static mock price history until real history is streamed.
function usePriceHistory(prob?: number) {
  if (prob === undefined) return [];
  // Generate a stable-looking history based on current value.
  return Array.from({ length: 30 }, (_, i) => ({
    t: i,
    v: Math.max(0, Math.min(1, prob + (Math.sin(i * 0.4) * 0.03))),
  }));
}

export function LeftPanel({ state }: Readonly<Props>) {
  const prob = state?.probability;
  const drift = state?.drift;
  const anomaly = state?.anomaly;
  const reality = state?.realitySnapshot;
  const pf = state?.participantFlow;
  const physics = state?.marketPhysics;
  const scenario = state?.scenarioBranchState;
  const meta = state?.metaCalibration;
  const uncertaintyTone = uncertaintyToneClass(reality?.uncertaintyState);

  const priceHistory = usePriceHistory(prob?.estimatedProbability);
  const obiValue = (reality?.beliefFactor ?? 0.5) * 2 - 1; // map 0-1 → -1..+1

  return (
    <aside className="flex flex-col w-[26%] min-w-0 bg-surface panel-border overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 panel-border flex items-center justify-between shrink-0">
        <span className="panel-header">reality layer</span>
        <span className="font-mono text-2xs text-muted">{prob?.contractId ?? 'KXBTC'}</span>
      </div>

      {/* Probability chart */}
      <div className="px-3 pt-2 pb-1 shrink-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="panel-header">kalshi implied</span>
          <span className="font-mono text-xs text-primary">{((prob?.marketImpliedProbability ?? 0) * 100).toFixed(1)}%</span>
        </div>
        <ProbabilitySparkline data={priceHistory} />
      </div>

      {/* Probability divergence */}
      <div className="px-3 py-2 panel-border shrink-0">
        <span className="panel-header block mb-1.5">probability divergence</span>
        <ProbBar label="SYS" value={prob?.estimatedProbability ?? 0} color="#3B82F6" />
        <ProbBar label="MKT" value={prob?.marketImpliedProbability ?? 0} color="#00E5A8" />
        <div className="flex items-center justify-between mt-1">
          <span className="font-mono text-2xs text-muted">edge</span>
          <span className={cx(
            'font-mono text-xs font-semibold',
            (prob?.edge ?? 0) > 0 ? 'text-green' : 'text-red',
          )}>
            {(prob?.edge ?? 0) > 0 ? '+' : ''}{((prob?.edge ?? 0) * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Liquidity heatmap */}
      <div className="px-3 py-2 panel-border shrink-0">
        <span className="panel-header block mb-1.5">liquidity signals</span>
        <HeatRow label="OBI" value={Math.abs(obiValue)} intensity={obiValue} />
        <HeatRow label="SPREAD" value={prob?.calibrationError ?? 0} intensity={-(prob?.calibrationError ?? 0)} />
        <HeatRow label="SWEEP" value={prob?.uncertaintyScore ?? 0} intensity={1 - (prob?.uncertaintyScore ?? 0)} />
        <HeatRow label="STRUCT" value={physics?.structuralStress ?? 0} intensity={-(physics?.structuralStress ?? 0)} />
      </div>

      {/* Drift & calibration */}
      <div className="px-3 py-2 panel-border shrink-0">
        <span className="panel-header block mb-1.5">regime state</span>
        <div className="flex gap-2">
          <Badge
            label="drift"
            value={drift?.severity ?? 'none'}
            color={SEVERITY_COLOR[drift?.severity ?? 'none']}
          />
          <Badge
            label="anomaly"
            value={anomaly?.severity ?? 'none'}
            color={SEVERITY_COLOR[anomaly?.severity ?? 'none']}
          />
          <Badge
            label="regime"
            value={prob?.regime ?? '—'}
            color="#FFB020"
          />
          <Badge
            label="meta"
            value={`${(((meta?.compositeScore ?? 0) * 100).toFixed(0))}%`}
            color={metaToneColor(meta?.compositeScore ?? 0)}
          />
        </div>
        {/* Uncertainty */}
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-2xs text-muted">uncertainty</span>
          <span className={cx('font-mono text-xs', uncertaintyTone)}>
            {reality?.uncertaintyState ?? '—'}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-2xs text-muted">branch</span>
          <span className={cx('font-mono text-2xs', scenario?.invalidated ? 'text-red' : 'text-secondary')}>
            {scenario?.dominantBranch ?? 'pending'}
          </span>
        </div>
      </div>

      {/* Participant flow */}
      <div className="px-3 py-2 flex-1 overflow-hidden">
        <span className="panel-header block mb-1.5">participant flow</span>
        {pf ? (
          <>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={cx('text-2xs font-mono font-semibold uppercase px-1.5 py-0.5 rounded border', participantPillClass(pf.dominant))}>
                {pf.dominant}
              </span>
              {pf.trappedTraderSignal && (
                <span className="text-2xs font-mono text-yellow">⚠ trapped</span>
              )}
            </div>
            <StackedBar distribution={pf.distribution} />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="font-mono text-2xs text-muted">aggression</span>
              <span className="font-mono text-xs text-primary">{(pf.aggressionIndex * 100).toFixed(0)}%</span>
            </div>
          </>
        ) : (
          <span className="font-mono text-2xs text-muted">awaiting data…</span>
        )}
      </div>
    </aside>
  );
}

function ProbabilitySparkline({ data }: Readonly<{ data: Array<{ t: number; v: number }> }>) {
  if (data.length < 2) {
    return <div className="w-full h-12 bg-elevated rounded" />;
  }

  const lastIndex = data.length - 1;
  const points = data
    .map((point, index) => {
      const x = (index / lastIndex) * 100;
      const y = (1 - Math.max(0, Math.min(1, point.v))) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-12">
      <defs>
        <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#00E5A8" stopOpacity="0.3" />
          <stop offset="95%" stopColor="#00E5A8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#probGrad)" />
      <polyline points={points} fill="none" stroke="#00E5A8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ProbBar({ label, value, color }: Readonly<{ label: string; value: number; color: string }>) {
  const fillClass = color === '#3B82F6' ? 'bg-blue' : 'bg-green';
  return (
    <div className="flex items-center gap-2 mb-0.5">
      <span className="font-mono text-2xs text-muted w-6">{label}</span>
      <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full transition-all duration-300', widthPctClass(value), fillClass)} />
      </div>
      <span className="font-mono text-2xs text-primary w-10 text-right">{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

function HeatRow({ label, value, intensity }: Readonly<{ label: string; value: number; intensity: number }>) {
  const activeCells = Math.round(Math.max(0, Math.min(1, value)) * 10);
  const activeClass = intensity >= 0 ? 'bg-green' : 'bg-red';
  return (
    <div className="flex items-center gap-2 mb-0.5">
      <span className="font-mono text-2xs text-muted w-12">{label}</span>
      <div className="flex-1 grid grid-cols-10 gap-px h-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={cx(
              'rounded-sm',
              i < activeCells ? activeClass : 'bg-border opacity-30',
              i < activeCells && heatOpacityClass(i),
            )}
          />
        ))}
      </div>
      <span className="font-mono text-2xs text-primary w-8 text-right">{(value * 100).toFixed(0)}</span>
    </div>
  );
}

function Badge({ label, value, color }: Readonly<{ label: string; value: string; color: string }>) {
  const toneClass = toneClassFromColor(color);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="panel-header">{label}</span>
      <span className={cx('font-mono text-2xs font-semibold uppercase', toneClass)}>{value}</span>
    </div>
  );
}

function StackedBar({ distribution }: Readonly<{ distribution: Record<ParticipantType, number> }>) {
  const types: ParticipantType[] = ['liquidity-provider', 'momentum', 'panic-flow', 'arbitrage', 'trapped-trader'];
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      {types.map((t) => (
        <div
          key={t}
          className={cx(widthPctClass(distribution[t] ?? 0), participantFillClass(t))}
          title={`${t}: ${((distribution[t] ?? 0) * 100).toFixed(0)}%`}
        />
      ))}
    </div>
  );
}

function participantPillClass(participant: ParticipantType): string {
  switch (participant) {
    case 'liquidity-provider':
      return 'text-green border-green/30';
    case 'momentum':
      return 'text-blue border-blue/30';
    case 'panic-flow':
      return 'text-red border-red/30';
    case 'arbitrage':
      return 'text-yellow border-yellow/30';
    default:
      return 'text-[#FF8C00] border-[#FF8C00]/30';
  }
}

function participantFillClass(participant: ParticipantType): string {
  switch (participant) {
    case 'liquidity-provider':
      return 'bg-green';
    case 'momentum':
      return 'bg-blue';
    case 'panic-flow':
      return 'bg-red';
    case 'arbitrage':
      return 'bg-yellow';
    default:
      return 'bg-[#FF8C00]';
  }
}

function uncertaintyToneClass(state: string | undefined): string {
  if (state === 'extreme') {
    return 'text-red';
  }
  if (state === 'high') {
    return 'text-yellow';
  }
  return 'text-green';
}

function toneClassFromColor(color: string): string {
  switch (color) {
    case '#00E5A8':
      return 'text-green';
    case '#FFB020':
      return 'text-yellow';
    case '#FF8C00':
      return 'text-[#FF8C00]';
    case '#FF4D4D':
      return 'text-red';
    default:
      return 'text-neutral';
  }
}

function metaToneColor(score: number): string {
  if (score > 0.7) {
    return '#00E5A8';
  }
  if (score > 0.45) {
    return '#FFB020';
  }
  return '#FF4D4D';
}
