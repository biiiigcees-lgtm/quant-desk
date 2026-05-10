'use client';

import clsx from 'clsx';
import type { SystemStateSnapshot, CausalInsight } from '@/lib/types';
import { SYSTEM_STATE_COLOR } from '@/lib/tokens';

interface Props { state: SystemStateSnapshot | null }

export function CenterPanel({ state }: Props) {
  const prob = state?.probability;
  const reality = state?.realitySnapshot;
  const calibration = state?.calibration;
  const drift = state?.drift;
  const anomaly = state?.anomaly;
  const execControl = state?.executionControl;
  const causalInsights = state?.causalInsights ?? [];
  const epistemicHealth = state?.epistemicHealth;
  const adversarialAudit = state?.adversarialAudit;

  const estProb = prob?.estimatedProbability ?? 0;
  const ciLow = prob?.confidenceInterval?.[0] ?? estProb;
  const ciHigh = prob?.confidenceInterval?.[1] ?? estProb;
  const edge = prob?.edge ?? 0;
  const uncertainty = prob?.uncertaintyScore ?? 0;
  const permission = reality?.executionPermission ?? false;
  const systemState = reality?.systemState ?? 'nominal';
  const stateColor = SYSTEM_STATE_COLOR[systemState];

  const edgeScore = Math.round(Math.min(100, Math.max(0, Math.abs(edge) * 1000)));

  return (
    <main className="flex flex-col flex-1 min-w-0 panel-border overflow-hidden bg-base">
      {/* Header */}
      <div className="px-4 py-1.5 panel-border flex items-center justify-between shrink-0">
        <span className="panel-header">decision consciousness</span>
        <span className="font-mono text-2xs text-muted">{execControl?.mode ?? 'normal'}</span>
      </div>

      {/* Large belief display */}
      <div className="flex flex-col items-center justify-center py-6 panel-border shrink-0">
        <span className="panel-header mb-2">estimated probability</span>
        <div className="relative flex items-baseline gap-2">
          <span
            className="font-mono text-6xl font-semibold leading-none"
            style={{ color: edge > 0.01 ? '#00E5A8' : edge < -0.01 ? '#FF4D4D' : '#E6EDF3' }}
          >
            {(estProb * 100).toFixed(1)}
          </span>
          <span className="font-mono text-2xl text-muted">%</span>
        </div>
        {/* CI band */}
        <div className="flex items-center gap-1 mt-1">
          <span className="font-mono text-2xs text-muted">[{(ciLow * 100).toFixed(1)}</span>
          <span className="font-mono text-2xs text-muted">—</span>
          <span className="font-mono text-2xs text-muted">{(ciHigh * 100).toFixed(1)}]</span>
        </div>
        {/* CI bar */}
        <div className="relative w-40 h-1 bg-elevated rounded-full mt-2 overflow-visible">
          <div
            className="absolute h-1 rounded-full opacity-30"
            style={{
              left: `${ciLow * 100}%`,
              width: `${(ciHigh - ciLow) * 100}%`,
              backgroundColor: '#3B82F6',
            }}
          />
          <div
            className="absolute w-2 h-2 rounded-full -top-0.5 -translate-x-1/2"
            style={{ left: `${estProb * 100}%`, backgroundColor: '#3B82F6' }}
          />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 divide-x divide-border panel-border shrink-0">
        <Metric label="edge score" value={`${edgeScore}`} unit="/100" color={edgeScore > 40 ? '#00E5A8' : edgeScore > 20 ? '#FFB020' : '#FF4D4D'} />
        <Metric label="uncertainty" value={`${(uncertainty * 100).toFixed(0)}`} unit="%" color={uncertainty < 0.3 ? '#00E5A8' : uncertainty < 0.6 ? '#FFB020' : '#FF4D4D'} />
        <Metric label="truth score" value={`${((reality?.truthScore ?? 0) * 100).toFixed(0)}`} unit="%" color={stateColor} />
      </div>

      {/* Uncertainty map */}
      <div className="px-4 py-3 panel-border shrink-0">
        <span className="panel-header block mb-2">uncertainty decomposition</span>
        <div className="grid grid-cols-4 gap-2">
          <UncertaintyCell label="calibration" value={calibration?.ece ?? 0} invert />
          <UncertaintyCell label="drift PSI" value={drift?.psi ?? 0} invert />
          <UncertaintyCell label="anomaly" value={anomaly ? 1 : 0} invert />
          <UncertaintyCell label="belief" value={reality?.beliefFactor ?? 0} />
        </div>
      </div>

      {/* Epistemic health */}
      {epistemicHealth && (
        <div className="px-4 py-2 panel-border shrink-0 flex items-center gap-3">
          <span className="panel-header">epistemic health</span>
          <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(epistemicHealth.epistemicHealthScore * 100)}%`,
                backgroundColor: epistemicHealth.epistemicHealthScore > 0.7 ? '#00E5A8' : epistemicHealth.epistemicHealthScore > 0.4 ? '#FFB020' : '#FF4D4D',
              }}
            />
          </div>
          <span
            className="font-mono text-xs font-bold px-1.5 py-0.5 rounded"
            style={{
              color: epistemicHealth.healthGrade === 'A' ? '#00E5A8' : epistemicHealth.healthGrade === 'B' ? '#3B82F6' : epistemicHealth.healthGrade === 'C' ? '#FFB020' : '#FF4D4D',
              border: `1px solid currentColor`,
            }}
          >
            {epistemicHealth.healthGrade}
          </span>
        </div>
      )}

      {/* Adversarial audit warning */}
      {adversarialAudit && adversarialAudit.adversarialScore > 0.5 && (
        <div className="mx-4 my-1 px-3 py-2 rounded border border-red bg-elevated shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-2xs font-bold text-red uppercase">adversarial risk</span>
            <span className="font-mono text-2xs text-muted">{(adversarialAudit.adversarialScore * 100).toFixed(0)}%</span>
          </div>
          <p className="font-mono text-2xs text-secondary line-clamp-2">{adversarialAudit.counterNarrative}</p>
        </div>
      )}

      {/* Execution permission */}
      <div className="px-4 py-4 panel-border shrink-0 flex items-center justify-between">
        <div>
          <span className="panel-header block mb-1">execution permission</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{permission ? '🔓' : '🔒'}</span>
            <div>
              <div
                className="font-mono text-sm font-bold uppercase"
                style={{ color: permission ? '#00E5A8' : '#FF4D4D' }}
              >
                {permission ? 'permitted' : 'blocked'}
              </div>
              <div className="font-mono text-2xs text-muted">
                {execControl?.reason ?? 'no override active'}
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="panel-header block mb-1">governance</span>
          <div
            className="font-mono text-xs font-semibold uppercase"
            style={{ color: stateColor }}
          >
            {systemState}
          </div>
          <div className="font-mono text-2xs text-muted mt-0.5">
            {reality?.actionableState ? 'actionable' : 'standby'}
          </div>
        </div>
      </div>

      {/* Causal graph */}
      <div className="px-4 py-3 flex-1 overflow-hidden">
        <span className="panel-header block mb-2">causal world model</span>
        {causalInsights.length > 0 ? (
          <div className="space-y-1 overflow-y-auto max-h-full">
            {causalInsights.map((insight, i) => (
              <CausalRow key={i} insight={insight} />
            ))}
          </div>
        ) : (
          <CausalGraphPlaceholder />
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="flex flex-col items-center py-3 gap-0.5">
      <span className="panel-header">{label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className="font-mono text-2xl font-semibold" style={{ color }}>{value}</span>
        <span className="font-mono text-xs text-muted">{unit}</span>
      </div>
    </div>
  );
}

function UncertaintyCell({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const display = invert ? 1 - value : value;
  const color = display > 0.7 ? '#00E5A8' : display > 0.4 ? '#FFB020' : '#FF4D4D';
  return (
    <div className="bg-elevated rounded p-2 flex flex-col gap-1">
      <span className="panel-header">{label}</span>
      <div className="w-full h-1 bg-border rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.round(display * 100)}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono text-2xs" style={{ color }}>{(display * 100).toFixed(0)}%</span>
    </div>
  );
}

function CausalRow({ insight }: { insight: CausalInsight }) {
  const shortLabel = (s: string) => s.split(':')[1] ?? s;
  return (
    <div className={clsx(
      'flex items-center gap-2 px-2 py-1 rounded text-2xs font-mono',
      insight.spurious ? 'bg-elevated opacity-50' : 'bg-elevated',
    )}>
      <span className="text-yellow">{shortLabel(insight.cause)}</span>
      <span className="text-muted">→</span>
      <span className="text-blue">{shortLabel(insight.effect)}</span>
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round(insight.causalStrength * 100)}%`, backgroundColor: '#3B82F6' }}
        />
      </div>
      <span className="text-primary w-8 text-right">{(insight.causalStrength * 100).toFixed(0)}%</span>
      {insight.spurious && <span className="text-red">~</span>}
    </div>
  );
}

function CausalGraphPlaceholder() {
  const nodes = [
    { x: 50, y: 20, label: 'micro', color: '#00E5A8' },
    { x: 20, y: 50, label: 'drift', color: '#FFB020' },
    { x: 80, y: 50, label: 'prob', color: '#3B82F6' },
    { x: 50, y: 80, label: 'exec', color: '#FF4D4D' },
  ];
  const edges = [[0, 2], [1, 2], [2, 3]];

  return (
    <svg viewBox="0 0 100 100" className="w-full h-24 opacity-30">
      {edges.map(([from, to], i) => (
        <line
          key={i}
          x1={nodes[from]!.x} y1={nodes[from]!.y}
          x2={nodes[to]!.x} y2={nodes[to]!.y}
          stroke="#1E2D42" strokeWidth="1"
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="6" fill="#0F1629" stroke={n.color} strokeWidth="1" />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fill={n.color} fontSize="4" fontFamily="JetBrains Mono">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}
