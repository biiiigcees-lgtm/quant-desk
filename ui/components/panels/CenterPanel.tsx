'use client';

import { cx } from '../../lib/cx';
import type { SystemStateSnapshot, CausalInsight } from '../../lib/types';
import { leftPctClass, widthPctClass } from '../../lib/visual';

interface Props { state: SystemStateSnapshot | null }

export function CenterPanel({ state }: Readonly<Props>) {
  const prob = state?.probability;
  const reality = state?.realitySnapshot;
  const calibration = state?.calibration;
  const drift = state?.drift;
  const anomaly = state?.anomaly;
  const execControl = state?.executionControl;
  const causalInsights = state?.causalInsights ?? [];
  const marketCausalState = state?.marketCausalState;
  const epistemicHealth = state?.epistemicHealth;
  const adversarialAudit = state?.adversarialAudit;
  const systemConsciousness = state?.systemConsciousness;
  const marketPhysics = state?.marketPhysics;
  const scenarioBranchState = state?.scenarioBranchState;
  const crossMarket = state?.crossMarketCausalState;
  const marketWorld = state?.marketWorldState;
  const metaCalibration = state?.metaCalibration;
  const operatorAttention = state?.operatorAttention;
  const marketExperience = state?.marketExperience;

  const estProb = prob?.estimatedProbability ?? 0;
  const ciLow = prob?.confidenceInterval?.[0] ?? estProb;
  const ciHigh = prob?.confidenceInterval?.[1] ?? estProb;
  const edge = prob?.edge ?? 0;
  const uncertainty = prob?.uncertaintyScore ?? 0;
  const permission = reality?.executionPermission ?? false;
  const systemState = reality?.systemState ?? 'nominal';
  const stateTextClass = systemStateTextClass(systemState);

  const edgeScore = Math.round(Math.min(100, Math.max(0, Math.abs(edge) * 1000)));
  const edgeScoreToneClass = scoreToneClass(edgeScore, 40, 20);
  const uncertaintyToneClass = uncertaintyToneClassFromValue(uncertainty);
  const epistemicScore = epistemicHealth?.epistemicHealthScore ?? 0;
  const epistemicFillClass = fillToneClass(epistemicScore);

  return (
    <main className="flex flex-col flex-1 min-w-0 panel-border overflow-hidden bg-surface">
      {/* Header */}
      <div className="px-4 py-2 panel-border flex items-center justify-between shrink-0">
        <span className="panel-header">decision consciousness</span>
        <span className="font-mono text-2xs text-muted">{execControl?.mode ?? 'normal'}</span>
      </div>

      {/* Large belief display */}
      <div className="flex flex-col items-center justify-center py-6 md:py-7 panel-border shrink-0 px-4">
        <span className="panel-header mb-2">estimated probability</span>
        <div className="relative flex items-baseline gap-2">
          <span className={cx('font-mono text-5xl md:text-6xl font-bold leading-none tracking-tight', edgeToneClass(edge))}>
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
        <div className="relative w-full max-w-[10rem] h-1 bg-elevated rounded-full mt-2 overflow-visible">
          <div className={cx('absolute h-1 rounded-full opacity-25 bg-secondary transition-calm', leftPctClass(ciLow), widthPctClass(ciHigh - ciLow))} />
          <div
            className={cx('absolute w-2 h-2 rounded-full -top-0.5 -translate-x-1/2 bg-primary transition-calm', leftPctClass(estProb))}
          />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 divide-x divide-border panel-border shrink-0">
        <Metric label="edge score" value={`${edgeScore}`} unit="/100" toneClass={edgeScoreToneClass} />
        <Metric label="uncertainty" value={`${(uncertainty * 100).toFixed(0)}`} unit="%" toneClass={uncertaintyToneClass} />
        <Metric label="truth score" value={`${((reality?.truthScore ?? 0) * 100).toFixed(0)}`} unit="%" toneClass={stateTextClass} />
      </div>

      {/* Uncertainty map */}
      <div className="px-4 py-3.5 panel-border shrink-0">
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
              className={cx(
                'h-full rounded-full transition-calm',
                widthPctClass(epistemicScore),
                epistemicFillClass,
              )}
            />
          </div>
          <span className={cx('font-mono text-xs font-bold px-1.5 py-0.5 rounded border border-current', healthGradeClass(epistemicHealth.healthGrade))}>
            {epistemicHealth.healthGrade}
          </span>
        </div>
      )}

      {(marketWorld || metaCalibration || operatorAttention || scenarioBranchState || systemConsciousness) && (
        <div className="px-4 py-2 panel-border shrink-0">
          <span className="panel-header block mb-1.5">cognitive fusion</span>
          <div className="grid grid-cols-4 gap-2">
            <FusionCell label="world" value={marketWorld?.worldConfidence ?? 0} />
            <FusionCell label="meta" value={metaCalibration?.compositeScore ?? 0} />
            <FusionCell label="trust" value={systemConsciousness?.selfTrustScore ?? 0} />
            <FusionCell label="attention" value={1 - (operatorAttention?.density ?? 0)} />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-2xs text-secondary">
            <span>
              {marketWorld?.participantIntent ?? 'neutral'} / {scenarioBranchState?.dominantBranch ?? 'branch-0'}
            </span>
            <span>
              tx {((crossMarket?.riskTransmissionScore ?? 0) * 100).toFixed(0)}% | stress {((marketPhysics?.structuralStress ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
          {operatorAttention?.focus === 'critical' && (
            <div className="mt-2 px-2 py-1 rounded border border-red/30 bg-elevated/70 font-mono text-2xs text-red">
              operator attention critical: {operatorAttention?.contradictionHotspots?.join(', ') || 'hotspots unresolved'}
            </div>
          )}
          {marketExperience?.recurringFailureSignature && (
            <div className="mt-1 px-2 py-1 rounded border border-yellow/30 bg-elevated/70 font-mono text-2xs text-yellow">
              recurring failure archetype: {marketExperience?.archetype ?? 'unknown'} | trauma {((marketExperience?.traumaPenalty ?? 0) * 100).toFixed(0)}%
            </div>
          )}
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
      <div className="px-4 py-4 panel-border shrink-0 flex items-center justify-between gap-4">
        <div>
          <span className="panel-header block mb-1">execution permission</span>
          <div>
            <div
              className={cx('font-mono text-sm font-bold uppercase tracking-wide', permission ? 'text-green' : 'text-yellow')}
            >
              {permission ? 'permitted' : 'standby'}
            </div>
            <div className="font-mono text-2xs text-muted">
              {execControl?.reason ?? 'no override active'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="panel-header block mb-1">governance</span>
          <div className={cx('font-mono text-xs font-semibold uppercase', stateTextClass)}>
            {systemState}
          </div>
          <div className="font-mono text-2xs text-muted mt-0.5">
            {reality?.actionableState ? 'actionable' : 'standby'}
          </div>
        </div>
      </div>

      {/* Causal graph */}
      <div className="px-4 py-3.5 flex-1 overflow-hidden">
        <span className="panel-header block mb-2">causal world model</span>
        {marketCausalState && (
          <div className="mb-2 px-2 py-1.5 rounded bg-elevated border border-border/60">
            <div className="flex items-center justify-between gap-2">
              <span className={cx('font-mono text-2xs font-semibold uppercase', hiddenStateToneClass(marketCausalState.hiddenState))}>
                {marketCausalState.hiddenState}
              </span>
              <span className="font-mono text-2xs text-muted">
                conf {(marketCausalState.confidence * 100).toFixed(0)}% | risk {(marketCausalState.instabilityRisk * 100).toFixed(0)}%
              </span>
            </div>
            {marketCausalState.topDriver && (
              <div className="mt-1 font-mono text-2xs text-secondary">
                driver: {marketCausalState.topDriver.cause.split(':').at(-1)} {'->'} {marketCausalState.topDriver.effect.split(':').at(-1)}
              </div>
            )}
          </div>
        )}
        {causalInsights.length > 0 ? (
          <div className="space-y-1 overflow-y-auto max-h-full">
            {causalInsights.map((insight) => (
              <CausalRow key={`${insight.contractId}-${insight.timestamp}-${insight.cause}-${insight.effect}`} insight={insight} />
            ))}
          </div>
        ) : (
          <CausalGraphPlaceholder />
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, unit, toneClass }: Readonly<{ label: string; value: string; unit: string; toneClass: string }>) {
  return (
    <div className="flex flex-col items-center py-3 gap-0.5">
      <span className="panel-header">{label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className={cx('font-mono text-2xl font-semibold', toneClass)}>{value}</span>
        <span className="font-mono text-xs text-muted">{unit}</span>
      </div>
    </div>
  );
}

function UncertaintyCell({ label, value, invert }: Readonly<{ label: string; value: number; invert?: boolean }>) {
  const display = invert ? 1 - value : value;
  const toneClass = textToneClass(display);
  const fillClass = fillToneClass(display);
  return (
    <div className="bg-elevated rounded p-2 flex flex-col gap-1">
      <span className="panel-header">{label}</span>
      <div className="w-full h-1 bg-border rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full', widthPctClass(display), fillClass)} />
      </div>
      <span className={cx('font-mono text-2xs', toneClass)}>{(display * 100).toFixed(0)}%</span>
    </div>
  );
}

function FusionCell({ label, value }: Readonly<{ label: string; value: number }>) {
  const clamped = Math.max(0, Math.min(1, value));
  const toneClass = textToneClass(clamped);
  const fillClass = fillToneClass(clamped);
  return (
    <div className="bg-elevated rounded p-2 flex flex-col gap-1">
      <span className="panel-header">{label}</span>
      <div className="w-full h-1 bg-border rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full', widthPctClass(clamped), fillClass)} />
      </div>
      <span className={cx('font-mono text-2xs', toneClass)}>{(clamped * 100).toFixed(0)}%</span>
    </div>
  );
}

function CausalRow({ insight }: Readonly<{ insight: CausalInsight }>) {
  const shortLabel = (s: string) => s.split(':')[1] ?? s;
  return (
    <div className={cx(
      'flex items-center gap-2 px-2 py-1 rounded text-2xs font-mono',
      insight.spurious ? 'bg-elevated opacity-50' : 'bg-elevated',
    )}>
      <span className="text-yellow">{shortLabel(insight.cause)}</span>
      <span className="text-muted">→</span>
      <span className="text-secondary">{shortLabel(insight.effect)}</span>
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full bg-secondary transition-calm', widthPctClass(insight.causalStrength))} />
      </div>
      <span className="text-primary w-8 text-right">{(insight.causalStrength * 100).toFixed(0)}%</span>
      {insight.spurious && <span className="text-red">~</span>}
    </div>
  );
}

function CausalGraphPlaceholder() {
  const nodes = [
    { x: 50, y: 20, label: 'micro', color: '#22C55E' },
    { x: 20, y: 50, label: 'drift', color: '#F59E0B' },
    { x: 80, y: 50, label: 'prob', color: '#9CA3AF' },
    { x: 50, y: 80, label: 'exec', color: '#EF4444' },
  ];
  const edges = [[0, 2], [1, 2], [2, 3]];

  return (
    <svg viewBox="0 0 100 100" className="w-full h-24 opacity-30">
      {edges.map(([from, to]) => {
        const fromNode = nodes[from];
        const toNode = nodes[to];
        if (!fromNode || !toNode) {
          return null;
        }
        return (
          <line
            key={`${from}-${to}`}
            x1={fromNode.x} y1={fromNode.y}
            x2={toNode.x} y2={toNode.y}
            stroke="#2A3441" strokeWidth="1"
          />
        );
      })}
      {nodes.map((n) => (
        <g key={n.label}>
          <circle cx={n.x} cy={n.y} r="6" fill="#11161D" stroke={n.color} strokeWidth="1" />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fill={n.color} fontSize="4" fontFamily="JetBrains Mono">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}

function edgeToneClass(edge: number): string {
  if (edge > 0.01) {
    return 'text-green';
  }
  if (edge < -0.01) {
    return 'text-red';
  }
  return 'text-primary';
}

function textToneClass(value: number): string {
  if (value > 0.7) {
    return 'text-green';
  }
  if (value > 0.4) {
    return 'text-yellow';
  }
  return 'text-red';
}

function fillToneClass(value: number): string {
  if (value > 0.7) {
    return 'bg-green';
  }
  if (value > 0.4) {
    return 'bg-yellow';
  }
  return 'bg-red';
}

function healthGradeClass(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-green';
    case 'B':
      return 'text-secondary';
    case 'C':
      return 'text-yellow';
    default:
      return 'text-red';
  }
}

function systemStateTextClass(systemState: string): string {
  switch (systemState) {
    case 'nominal':
      return 'text-green';
    case 'cautious':
      return 'text-yellow';
    case 'degraded':
      return 'text-yellow';
    case 'halted':
      return 'text-red';
    default:
      return 'text-neutral';
  }
}

function scoreToneClass(score: number, strong: number, moderate: number): string {
  if (score > strong) {
    return 'text-green';
  }
  if (score > moderate) {
    return 'text-yellow';
  }
  return 'text-red';
}

function uncertaintyToneClassFromValue(value: number): string {
  if (value < 0.3) {
    return 'text-green';
  }
  if (value < 0.6) {
    return 'text-yellow';
  }
  return 'text-red';
}

function hiddenStateToneClass(state: string): string {
  switch (state) {
    case 'momentum-continuation':
      return 'text-green';
    case 'liquidity-fragility':
      return 'text-yellow';
    case 'panic-feedback':
      return 'text-red';
    case 'mean-reversion-pressure':
      return 'text-secondary';
    default:
      return 'text-neutral';
  }
}
