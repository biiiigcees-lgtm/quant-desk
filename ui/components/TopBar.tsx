'use client';

import clsx from 'clsx';
import type { SystemStateSnapshot } from '@/lib/types';
import { SYSTEM_STATE_COLOR } from '@/lib/tokens';

interface Props {
  state: SystemStateSnapshot | null;
  isConnected: boolean;
}

export function TopBar({ state, isConnected }: Props) {
  const prob = state?.probability;
  const reality = state?.realitySnapshot;
  const systemState = reality?.systemState ?? 'nominal';
  const truthScore = reality?.truthScore ?? 0;
  const snapshotId = reality?.canonicalSnapshotId ?? '—';

  const estProb = prob?.estimatedProbability ?? 0;
  const marketProb = prob?.marketImpliedProbability ?? 0;
  const edge = prob?.edge ?? 0;

  return (
    <header className="flex items-center px-3 h-8 bg-surface panel-border shrink-0 gap-4 overflow-hidden">
      {/* System state pill */}
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-mono font-semibold uppercase"
        style={{ color: SYSTEM_STATE_COLOR[systemState], border: `1px solid ${SYSTEM_STATE_COLOR[systemState]}33` }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: SYSTEM_STATE_COLOR[systemState] }}
        />
        {systemState}
      </div>

      {/* Truth score bar */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="panel-header">truth</span>
        <div className="w-16 h-1.5 bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.round(truthScore * 100)}%`,
              backgroundColor: truthScore > 0.7 ? '#00E5A8' : truthScore > 0.45 ? '#FFB020' : '#FF4D4D',
            }}
          />
        </div>
        <span className="panel-header font-mono">{(truthScore * 100).toFixed(0)}%</span>
      </div>

      <div className="w-px h-4 bg-border" />

      {/* Probability display */}
      <div className="flex items-center gap-3 font-mono text-xs shrink-0">
        <span className="text-secondary">SYS</span>
        <span className="text-primary font-semibold">{(estProb * 100).toFixed(1)}%</span>
        <span className="text-muted">vs</span>
        <span className="text-secondary">MKT</span>
        <span className="text-primary">{(marketProb * 100).toFixed(1)}%</span>
        <span className={clsx('font-semibold', edge > 0 ? 'text-green' : edge < 0 ? 'text-red' : 'text-muted')}>
          {edge > 0 ? '+' : ''}{(edge * 100).toFixed(2)}% edge
        </span>
      </div>

      <div className="w-px h-4 bg-border" />

      {/* Regime */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="panel-header">regime</span>
        <span className="font-mono text-xs text-yellow uppercase">{prob?.regime ?? '—'}</span>
      </div>

      <div className="flex-1" />

      {/* Snapshot ID */}
      <span className="font-mono text-2xs text-muted tracking-widest hidden lg:block">
        snap:{snapshotId}
      </span>

      <div className="w-px h-4 bg-border" />

      {/* Connection dot */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={clsx('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-green' : 'bg-red')}
          style={{ boxShadow: isConnected ? '0 0 6px #00E5A8' : '0 0 6px #FF4D4D' }}
        />
        <span className="panel-header">{isConnected ? 'live' : 'offline'}</span>
      </div>
    </header>
  );
}
