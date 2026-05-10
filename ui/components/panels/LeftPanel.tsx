'use client';

import clsx from 'clsx';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import type { SystemStateSnapshot, ParticipantType } from '@/lib/types';
import { SEVERITY_COLOR } from '@/lib/tokens';

interface Props { state: SystemStateSnapshot | null }

const PARTICIPANT_COLORS: Record<ParticipantType, string> = {
  'liquidity-provider': '#00E5A8',
  'momentum':           '#3B82F6',
  'panic-flow':         '#FF4D4D',
  'arbitrage':          '#FFB020',
  'trapped-trader':     '#FF8C00',
};

// Static mock price history until real history is streamed.
function usePriceHistory(prob?: number) {
  if (prob === undefined) return [];
  // Generate a stable-looking history based on current value.
  return Array.from({ length: 30 }, (_, i) => ({
    t: i,
    v: Math.max(0, Math.min(1, prob + (Math.sin(i * 0.4) * 0.03))),
  }));
}

export function LeftPanel({ state }: Props) {
  const prob = state?.probability;
  const drift = state?.drift;
  const anomaly = state?.anomaly;
  const reality = state?.realitySnapshot;
  const pf = state?.participantFlow;

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
        <ResponsiveContainer width="100%" height={48}>
          <AreaChart data={priceHistory} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00E5A8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00E5A8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke="#00E5A8"
              strokeWidth={1.5}
              fill="url(#probGrad)"
              dot={false}
              isAnimationActive={false}
            />
            <Tooltip
              contentStyle={{ background: '#0F1629', border: '1px solid #1E2D42', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              labelFormatter={() => ''}
              formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, '']}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Probability divergence */}
      <div className="px-3 py-2 panel-border shrink-0">
        <span className="panel-header block mb-1.5">probability divergence</span>
        <ProbBar label="SYS" value={prob?.estimatedProbability ?? 0} color="#3B82F6" />
        <ProbBar label="MKT" value={prob?.marketImpliedProbability ?? 0} color="#00E5A8" />
        <div className="flex items-center justify-between mt-1">
          <span className="font-mono text-2xs text-muted">edge</span>
          <span className={clsx(
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
        </div>
        {/* Uncertainty */}
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-2xs text-muted">uncertainty</span>
          <span className={clsx('font-mono text-xs', reality?.uncertaintyState === 'extreme' ? 'text-red' : reality?.uncertaintyState === 'high' ? 'text-yellow' : 'text-green')}>
            {reality?.uncertaintyState ?? '—'}
          </span>
        </div>
      </div>

      {/* Participant flow */}
      <div className="px-3 py-2 flex-1 overflow-hidden">
        <span className="panel-header block mb-1.5">participant flow</span>
        {pf ? (
          <>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="text-2xs font-mono font-semibold uppercase px-1.5 py-0.5 rounded"
                style={{ color: PARTICIPANT_COLORS[pf.dominant], border: `1px solid ${PARTICIPANT_COLORS[pf.dominant]}44` }}
              >
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

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-0.5">
      <span className="font-mono text-2xs text-muted w-6">{label}</span>
      <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-2xs text-primary w-10 text-right">{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

function HeatRow({ label, value, intensity }: { label: string; value: number; intensity: number }) {
  const hue = intensity >= 0 ? '#00E5A8' : '#FF4D4D';
  return (
    <div className="flex items-center gap-2 mb-0.5">
      <span className="font-mono text-2xs text-muted w-12">{label}</span>
      <div className="flex-1 grid grid-cols-10 gap-px h-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{
              backgroundColor: i < Math.round(value * 10) ? hue : '#1E2D42',
              opacity: i < Math.round(value * 10) ? 0.4 + (i / 10) * 0.6 : 0.3,
            }}
          />
        ))}
      </div>
      <span className="font-mono text-2xs text-primary w-8 text-right">{(value * 100).toFixed(0)}</span>
    </div>
  );
}

function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="panel-header">{label}</span>
      <span className="font-mono text-2xs font-semibold uppercase" style={{ color }}>{value}</span>
    </div>
  );
}

function StackedBar({ distribution }: { distribution: Record<ParticipantType, number> }) {
  const types: ParticipantType[] = ['liquidity-provider', 'momentum', 'panic-flow', 'arbitrage', 'trapped-trader'];
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      {types.map((t) => (
        <div
          key={t}
          style={{ width: `${Math.round((distribution[t] ?? 0) * 100)}%`, backgroundColor: PARTICIPANT_COLORS[t] }}
          title={`${t}: ${((distribution[t] ?? 0) * 100).toFixed(0)}%`}
        />
      ))}
    </div>
  );
}
