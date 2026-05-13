'use client';

import { cx } from '../lib/cx';
import type { SystemStateSnapshot } from '../lib/types';

interface Props {
  state: SystemStateSnapshot | null;
}

export function MobileDecisionBar({ state }: Readonly<Props>) {
  const probability = state?.probability?.estimatedProbability ?? 0;
  const edge = state?.probability?.edge ?? 0;
  const uncertainty = state?.probability?.uncertaintyScore ?? 1;
  const confidence = clamp01(1 - uncertainty);
  const latency = minLatency(state);

  const decision = deriveDecision(probability, edge);

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface/98 backdrop-blur-sm">
      <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-2.5 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cx('font-mono text-xs font-bold uppercase tracking-wide', decision.tone)}>{decision.label}</span>
            <span className="font-mono text-2xs text-muted">{(probability * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-2xs text-secondary">
            <span>conf {(confidence * 100).toFixed(0)}%</span>
            <span>lat {latency}ms</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 text-2xs font-mono uppercase">
          <DecisionPill label="above" active={decision.label === 'above'} tone="green" />
          <DecisionPill label="below" active={decision.label === 'below'} tone="red" />
          <DecisionPill label="no bet" active={decision.label === 'no bet'} tone="neutral" />
        </div>
      </div>
    </div>
  );
}

function getToneClass(tone: 'green' | 'red' | 'neutral'): string {
  if (tone === 'green') return 'border-green text-green';
  if (tone === 'red') return 'border-red text-red';
  return 'border-neutral text-neutral';
}

function DecisionPill({ label, active, tone }: Readonly<{ label: string; active: boolean; tone: 'green' | 'red' | 'neutral' }>) {
  const toneClass = getToneClass(tone);
  return (
    <span className={cx('rounded border px-1.5 py-1 transition-calm', toneClass, active ? 'bg-elevated' : 'opacity-70')}>
      {label}
    </span>
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

function minLatency(state: SystemStateSnapshot | null): number {
  const metrics = state?.aiOrchestrationMetrics;
  if (!metrics || metrics.length === 0) {
    return 0;
  }
  return metrics.reduce((min, row) => Math.min(min, row.latencyMs), Number.POSITIVE_INFINITY);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
