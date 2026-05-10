'use client';

import clsx from 'clsx';
import type { SystemStateSnapshot } from '@/lib/types';

interface Props { state: SystemStateSnapshot | null }

type AgentStatus = 'active' | 'idle' | 'error';

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

function extractAgentMetrics(state: SystemStateSnapshot | null, agentId: string) {
  const metrics = state?.aiAggregatedIntelligence;
  const agentMetrics = (state as unknown as Record<string, unknown>)?.aiOrchestrationMetrics as Array<{ agent: string; latencyMs: number; cacheHit: boolean; fallbackDepth: number; timestamp: number }> | undefined;
  const latest = agentMetrics?.find((m) => m.agent === agentId);

  let confidence = 0.5;
  let status: AgentStatus = 'idle';
  let reasoning = 'awaiting trigger';

  if (agentId === 'market-analyst' && metrics?.market_state) {
    confidence = metrics.market_state.confidence;
    status = 'active';
    reasoning = metrics.market_state.narrative?.slice(0, 80) ?? '';
  } else if (agentId === 'probability-calibration' && metrics?.probability_adjustment) {
    confidence = metrics.probability_adjustment.calibrationScore;
    status = 'active';
    reasoning = `adj: ${(metrics.probability_adjustment.recommendedAdjustment > 0 ? '+' : '')}${(metrics.probability_adjustment.recommendedAdjustment * 100).toFixed(1)}%`;
  } else if (agentId === 'risk-governor' && metrics?.risk_level) {
    confidence = metrics.risk_level.confidence;
    status = 'active';
    reasoning = metrics.risk_level.recommendation?.slice(0, 80) ?? '';
  } else if (agentId === 'execution-intelligence' && metrics?.execution_recommendation) {
    confidence = metrics.execution_recommendation.confidence;
    status = 'active';
    reasoning = `${metrics.execution_recommendation.orderStyle} × ${metrics.execution_recommendation.slices} slices`;
  } else if (agentId === 'anomaly-detection' && metrics?.anomaly_flags && metrics.anomaly_flags.length > 0) {
    confidence = metrics.anomaly_flags[0]!.score;
    status = 'active';
    reasoning = `${metrics.anomaly_flags[0]!.type}: ${metrics.anomaly_flags[0]!.severity}`;
  }

  if (latest) {
    status = latest.fallbackDepth > 0 ? 'error' : 'active';
  }

  return { confidence, status, reasoning, latencyMs: latest?.latencyMs };
}

export function RightPanel({ state }: Props) {
  const failures = (state as unknown as Record<string, unknown>)?.aiOrchestrationFailures as Array<{ agent: string; error: string }> | undefined;

  return (
    <aside className="flex flex-col w-[28%] min-w-0 bg-surface panel-border overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 panel-border flex items-center justify-between shrink-0">
        <span className="panel-header">ai cognition network</span>
        <span className="font-mono text-2xs text-muted">{AGENTS.length} agents</span>
      </div>

      {/* Agent grid */}
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-1 gap-1.5">
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
      <div className="px-3 py-2 panel-border shrink-0">
        <span className="panel-header block mb-1.5">agent disagreement</span>
        <DisagreementMatrix state={state} />
      </div>

      {/* Orchestrator summary */}
      <div className="px-3 py-2 shrink-0">
        <span className="panel-header block mb-1">orchestrator</span>
        <p className="font-mono text-2xs text-secondary leading-relaxed line-clamp-3">
          {state?.aiAggregatedIntelligence?.market_state?.narrative ?? 'Meta-orchestrator idle. Awaiting market signal.'}
        </p>
      </div>
    </aside>
  );
}

function AgentNode({
  agent, confidence, status, reasoning, latencyMs,
}: {
  agent: AgentInfo;
  confidence: number;
  status: AgentStatus;
  reasoning: string;
  latencyMs?: number;
}) {
  const statusColor = status === 'active' ? '#00E5A8' : status === 'error' ? '#FF4D4D' : '#4A5568';
  const confColor = confidence > 0.7 ? '#00E5A8' : confidence > 0.4 ? '#FFB020' : '#FF4D4D';

  return (
    <div className="bg-elevated rounded p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="font-mono text-2xs text-primary font-semibold">{agent.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {latencyMs !== undefined && (
            <span className="font-mono text-2xs text-muted">{latencyMs}ms</span>
          )}
          <span
            className="font-mono text-2xs font-semibold"
            style={{ color: confColor }}
          >
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      {/* Confidence bar */}
      <div className="h-0.5 w-full bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round(confidence * 100)}%`, backgroundColor: confColor }}
        />
      </div>
      {/* Reasoning */}
      <p className="font-mono text-2xs text-muted leading-relaxed truncate">{reasoning}</p>
    </div>
  );
}

function DisagreementMatrix({ state }: { state: SystemStateSnapshot | null }) {
  // Compute disagreement from strategy weights vs uniform expectation.
  const weights = state?.aiAggregatedIntelligence?.strategy_weights ?? {};
  const agentSample = ['MKT', 'CAL', 'RSK', 'MIC', 'STR', 'EXE'];
  const values = agentSample.map((_, i) => Object.values(weights)[i] ?? Math.random() * 0.5);

  return (
    <div className="grid grid-cols-6 gap-px">
      {values.map((v, i) =>
        values.map((u, j) => {
          if (i === j) return <div key={`${i}-${j}`} className="h-4 rounded-sm bg-elevated" />;
          const diff = Math.abs(v - u);
          const alpha = Math.round(diff * 255).toString(16).padStart(2, '0');
          return (
            <div
              key={`${i}-${j}`}
              className="h-4 rounded-sm"
              style={{ backgroundColor: `#FF4D4D${alpha}` }}
              title={`${agentSample[i]} vs ${agentSample[j]}: ${(diff * 100).toFixed(0)}%`}
            />
          );
        })
      )}
    </div>
  );
}
