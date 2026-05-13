'use client';

import { cx } from '../../lib/cx';
import type { SystemStateSnapshot } from '../../lib/types';
import { widthPctClass } from '../../lib/visual';

interface Props { state: SystemStateSnapshot | null }

type AgentStatus = 'active' | 'idle' | 'error';
type Direction = 1 | 0 | -1;
type AgentSignal = { confidence: number; status: AgentStatus; reasoning: string };
type AggregatedIntelligence = NonNullable<SystemStateSnapshot['aiAggregatedIntelligence']>;

interface AgentInfo {
  id: string;
  label: string;
  shortLabel: string;
}

const AGENTS: AgentInfo[] = [
  { id: 'market-analyst',           label: 'Market Analyst',         shortLabel: 'MKT' },
  { id: 'probability-calibration',  label: 'Prob Calibration',       shortLabel: 'CAL' },
  { id: 'risk-governor',            label: 'Risk Governor',          shortLabel: 'RSK' },
  { id: 'microstructure-intelligence', label: 'Microstructure',     shortLabel: 'MIC' },
  { id: 'strategy-evolution',       label: 'Strategy Evolution',     shortLabel: 'STR' },
  { id: 'execution-intelligence',   label: 'Execution Intel',        shortLabel: 'EXE' },
  { id: 'anomaly-detection',        label: 'Anomaly Detection',      shortLabel: 'ANO' },
  { id: 'memory-research',          label: 'Memory / Research',      shortLabel: 'MEM' },
  { id: 'meta-orchestrator',        label: 'Meta Orchestrator',      shortLabel: 'ORC' },
];

const AGENT_SIGNAL_RESOLVERS: Record<string, (metrics: AggregatedIntelligence) => AgentSignal | null> = {
  'market-analyst': (metrics) => {
    if (!metrics.market_state) {
      return null;
    }
    return {
      confidence: metrics.market_state.confidence,
      status: 'active',
      reasoning: metrics.market_state.narrative?.slice(0, 80) ?? '',
    };
  },
  'probability-calibration': (metrics) => {
    if (!metrics.probability_adjustment) {
      return null;
    }
    const adjustment = metrics.probability_adjustment.recommendedAdjustment;
    const sign = adjustment > 0 ? '+' : '';
    return {
      confidence: metrics.probability_adjustment.calibrationScore,
      status: 'active',
      reasoning: `adj: ${sign}${(adjustment * 100).toFixed(1)}%`,
    };
  },
  'risk-governor': (metrics) => {
    if (!metrics.risk_level) {
      return null;
    }
    return {
      confidence: metrics.risk_level.confidence,
      status: 'active',
      reasoning: metrics.risk_level.recommendation?.slice(0, 80) ?? '',
    };
  },
  'execution-intelligence': (metrics) => {
    if (!metrics.execution_recommendation) {
      return null;
    }
    return {
      confidence: metrics.execution_recommendation.confidence,
      status: 'active',
      reasoning: `${metrics.execution_recommendation.orderStyle} × ${metrics.execution_recommendation.slices} slices`,
    };
  },
  'anomaly-detection': (metrics) => {
    const firstFlag = metrics.anomaly_flags?.[0];
    if (!firstFlag) {
      return null;
    }
    const normalizedScore = firstFlag.score > 1 ? firstFlag.score / 100 : firstFlag.score;
    return {
      confidence: normalizedScore,
      status: 'active',
      reasoning: `${firstFlag.type}: ${firstFlag.severity}`,
    };
  },
};

function extractAgentMetrics(state: SystemStateSnapshot | null, agentId: string) {
  const metrics = state?.aiAggregatedIntelligence;
  const agentMetrics = state?.aiOrchestrationMetrics;
  const latest = agentMetrics?.find((m) => m.agent === agentId);

  const signal = deriveAgentSignal(metrics, agentId);
  let confidence = signal?.confidence ?? 0.5;
  let status: AgentStatus = signal?.status ?? 'idle';
  let reasoning = signal?.reasoning ?? 'awaiting trigger';

  if (latest) {
    status = latest.fallbackDepth > 0 ? 'error' : 'active';
  }

  return { confidence, status, reasoning, latencyMs: latest?.latencyMs };
}

export function RightPanel({ state }: Readonly<Props>) {
  const failures = state?.aiOrchestrationFailures;
  const attention = state?.operatorAttention;
  const meta = state?.metaCalibration;
  const world = state?.marketWorldState;

  return (
    <aside className="hidden md:flex flex-col w-[28%] min-w-0 bg-surface panel-border overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 panel-border flex items-center justify-between shrink-0">
        <span className="panel-header">ai cognition network</span>
        <span className="font-mono text-2xs text-muted">{AGENTS.length} agents</span>
      </div>

      {/* Agent grid */}
      <div className="flex-1 overflow-y-auto p-2.5 grid grid-cols-1 gap-2">
        {AGENTS.map((agent) => {
          const { confidence, status, reasoning, latencyMs } = extractAgentMetrics(state, agent.id);
          const hasFailure = failures?.some((f) => f.agent === agent.id);
          return (
            <AgentNode
              key={agent.id}
              agent={agent}
              confidence={confidence}
              status={hasFailure ? 'error' : status}
              reasoning={reasoning}
              latencyMs={latencyMs}
            />
          );
        })}
      </div>

      {/* Disagreement matrix */}
      <div className="px-3 py-2.5 panel-border shrink-0">
        <span className="panel-header block mb-1.5">agent disagreement</span>
        <DisagreementMatrix state={state} />
      </div>

      {/* Orchestrator summary */}
      <div className="px-3 py-2.5 panel-border shrink-0">
        <span className="panel-header block mb-1">orchestrator</span>
        <p className="font-mono text-2xs text-secondary leading-relaxed line-clamp-3">
          {state?.aiAggregatedIntelligence?.market_state?.narrative ?? 'Meta-orchestrator idle. Awaiting market signal.'}
        </p>
        <div className="mt-2 flex items-center justify-between font-mono text-2xs text-muted">
          <span>meta {((meta?.compositeScore ?? 0) * 100).toFixed(0)}%</span>
          <span className={cx(attentionFocusClass(attention?.focus))}>
            {attention?.focus ?? 'normal'}
          </span>
        </div>
        <div className="mt-1 font-mono text-2xs text-secondary truncate">
          {world ? `${world.participantIntent} / branch ${world.scenarioDominantBranch}` : 'world model pending'}
        </div>
      </div>

      {/* Multi-timescale coherence */}
      <div className="px-3 py-2.5 shrink-0">
        <span className="panel-header block mb-1.5">temporal alignment</span>
        <MultiTimescaleBar state={state} />
      </div>
    </aside>
  );
}

function AgentNode({
  agent, confidence, status, reasoning, latencyMs,
}: Readonly<{
  agent: AgentInfo;
  confidence: number;
  status: AgentStatus;
  reasoning: string;
  latencyMs?: number;
}>) {
  const statusClass = statusDotClass(status);
  const confidenceToneClass = confidenceTextClass(confidence);
  const confidenceFillClass = confidenceFillClassFor(confidence);

  return (
    <div className="terminal-subcard p-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cx('w-1.5 h-1.5 rounded-full transition-calm', statusClass)} />
          <span className="font-mono text-2xs text-primary font-semibold tracking-wide">{agent.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {latencyMs !== undefined && (
            <span className="font-mono text-2xs text-muted">{latencyMs}ms</span>
          )}
          <span className={cx('font-mono text-2xs font-semibold', confidenceToneClass)}>
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      {/* Confidence bar */}
      <div className="h-0.5 w-full bg-border rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full transition-calm', widthPctClass(confidence), confidenceFillClass)} />
      </div>
      {/* Reasoning */}
      <p className="font-mono text-2xs text-muted/90 leading-relaxed truncate">{reasoning}</p>
    </div>
  );
}

function MultiTimescaleBar({ state }: Readonly<{ state: SystemStateSnapshot | null }>) {
  const mtv = state?.multiTimescaleView;
  const scales: Array<{ label: string; dir: Direction; strength: number }> = [
    { label: 'tick',   dir: mtv?.tick?.direction   ?? 0, strength: mtv?.tick?.strength   ?? 0 },
    { label: 'local',  dir: mtv?.local?.direction  ?? 0, strength: mtv?.local?.strength  ?? 0 },
    { label: 'regime', dir: mtv?.regime?.direction ?? 0, strength: mtv?.regime?.strength ?? 0 },
    { label: 'macro',  dir: mtv?.macro?.direction  ?? 0, strength: mtv?.macro?.strength  ?? 0 },
  ];
  const coherence = mtv?.coherenceScore ?? 0;
  const alignment = mtv?.temporalAlignment ?? 'divergent';
  const alignClass = alignmentTextClass(alignment);
  const alignFillClass = alignmentFillClass(alignment);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1">
        {scales.map(({ label, dir, strength }) => {
          const toneClass = directionTextClass(dir);
          const fillClass = directionFillClass(dir);
          return (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <span className="font-mono text-2xs text-muted">{label}</span>
              <div className="h-3 w-full bg-elevated rounded-sm overflow-hidden flex items-center justify-center">
                <div className={cx('h-full rounded-sm transition-calm', widthPctClass(strength), fillClass)} />
              </div>
              <span className={cx('font-mono text-2xs', toneClass)}>{directionGlyph(dir)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
          <div className={cx('h-full rounded-full transition-calm', widthPctClass(coherence), alignFillClass)} />
        </div>
        <span className={cx('font-mono text-2xs', alignClass)}>{alignment}</span>
      </div>
    </div>
  );
}

function DisagreementMatrix({ state }: Readonly<{ state: SystemStateSnapshot | null }>) {
  // Compute disagreement from strategy weights vs uniform expectation.
  const weights = state?.aiAggregatedIntelligence?.strategy_weights ?? {};
  const agentSample = ['MKT', 'CAL', 'RSK', 'MIC', 'STR', 'EXE'];
  const FALLBACK_WEIGHTS = [0.18, 0.22, 0.15, 0.2, 0.12, 0.13];
  const values = agentSample.map((_, i) => Object.values(weights)[i] ?? FALLBACK_WEIGHTS[i] ?? 0.1);
  const disagreementClassByBucket = ['bg-red/5', 'bg-red/10', 'bg-red/15', 'bg-red/20', 'bg-red/25', 'bg-red/35'];

  return (
    <div className="grid grid-cols-6 gap-px">
      {values.map((v, i) =>
        values.map((u, j) => {
          if (i === j) return <div key={`${i}-${j}`} className="h-4 rounded-sm bg-elevated" />;
          const diff = Math.abs(v - u);
          const bucket = Math.max(0, Math.min(5, Math.round(diff * 5)));
          return (
            <div
              key={`${i}-${j}`}
              className={cx('h-4 rounded-sm', disagreementClassByBucket[bucket])}
              title={`${agentSample[i]} vs ${agentSample[j]}: ${(diff * 100).toFixed(0)}%`}
            />
          );
        })
      )}
    </div>
  );
}

function deriveAgentSignal(metrics: SystemStateSnapshot['aiAggregatedIntelligence'], agentId: string): AgentSignal | null {
  if (!metrics) {
    return null;
  }
  const resolver = AGENT_SIGNAL_RESOLVERS[agentId];
  return resolver ? resolver(metrics) : null;
}

function directionGlyph(direction: Direction): string {
  if (direction === 1) {
    return '▲';
  }
  if (direction === -1) {
    return '▼';
  }
  return '—';
}

function statusDotClass(status: AgentStatus): string {
  switch (status) {
    case 'active':
      return 'bg-green';
    case 'error':
      return 'bg-red';
    default:
      return 'bg-neutral';
  }
}

function confidenceTextClass(confidence: number): string {
  if (confidence > 0.7) {
    return 'text-green';
  }
  if (confidence > 0.4) {
    return 'text-yellow';
  }
  return 'text-red';
}

function confidenceFillClassFor(confidence: number): string {
  if (confidence > 0.7) {
    return 'bg-green';
  }
  if (confidence > 0.4) {
    return 'bg-yellow';
  }
  return 'bg-red';
}

function directionTextClass(direction: Direction): string {
  if (direction === 1) {
    return 'text-green';
  }
  if (direction === -1) {
    return 'text-red';
  }
  return 'text-neutral';
}

function directionFillClass(direction: Direction): string {
  if (direction === 1) {
    return 'bg-green';
  }
  if (direction === -1) {
    return 'bg-red';
  }
  return 'bg-neutral';
}

function alignmentTextClass(alignment: 'aligned' | 'mixed' | 'divergent'): string {
  if (alignment === 'aligned') {
    return 'text-green';
  }
  if (alignment === 'mixed') {
    return 'text-yellow';
  }
  return 'text-red';
}

function alignmentFillClass(alignment: 'aligned' | 'mixed' | 'divergent'): string {
  if (alignment === 'aligned') {
    return 'bg-green';
  }
  if (alignment === 'mixed') {
    return 'bg-yellow';
  }
  return 'bg-red';
}

function attentionFocusClass(focus: 'normal' | 'focused' | 'critical' | undefined): string {
  if (focus === 'critical') {
    return 'text-red';
  }
  if (focus === 'focused') {
    return 'text-yellow';
  }
  return 'text-green';
}
