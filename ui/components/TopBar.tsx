'use client';

import { cx } from '../lib/cx';
import type { SystemStateSnapshot } from '../lib/types';
import { widthPctClass } from '../lib/visual';

interface Props {
  state: SystemStateSnapshot | null;
  isConnected: boolean;
}

export function TopBar({ state, isConnected }: Readonly<Props>) {
  const prob = state?.probability;
  const reality = state?.realitySnapshot;
  const systemState = reality?.systemState ?? 'nominal';
  const truthScore = reality?.truthScore ?? 0;
  const snapshotId = reality?.canonicalSnapshotId ?? '—';
  const epistemicGrade = state?.epistemicHealth?.healthGrade;
  const metaCalibration = state?.metaCalibration?.compositeScore;
  const authorityDecay = state?.metaCalibration?.authorityDecay;
  const selfTrust = state?.systemConsciousness?.selfTrustScore;

  const estProb = prob?.estimatedProbability ?? 0;
  const marketProb = prob?.marketImpliedProbability ?? 0;
  const edge = prob?.edge ?? 0;

  return (
    <header className="flex min-h-11 md:h-9 items-center px-3 md:px-4 py-1 md:py-0 bg-surface panel-border shrink-0 gap-3 md:gap-5 overflow-x-auto overflow-y-hidden whitespace-nowrap">
      {/* System state pill */}
      <div
        className={cx(
          'flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-mono font-semibold uppercase border transition-calm',
          systemStatePillClass(systemState),
        )}
      >
        <span className={cx('w-1.5 h-1.5 rounded-full', systemStateDotClass(systemState))} />
        {systemState}
      </div>

      {/* Epistemic health grade badge — hidden on mobile */}
      {epistemicGrade && (
        <div
          className={cx(
            'hidden lg:flex px-1.5 py-0.5 rounded font-mono text-2xs font-bold border transition-calm',
            epistemicGradeClass(epistemicGrade),
          )}
          title={`Epistemic health: ${epistemicGrade}`}
        >
          EH:{epistemicGrade}
        </div>
      )}

      {metaCalibration !== undefined && (
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          <span className="panel-header">meta</span>
          <span className={cx('font-mono text-2xs font-semibold', scoreToneClass(metaCalibration))}>
            {(metaCalibration * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {selfTrust !== undefined && (
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          <span className="panel-header">trust</span>
          <span className={cx('font-mono text-2xs font-semibold', scoreToneClass(selfTrust))}>
            {(selfTrust * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {authorityDecay !== undefined && (
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          <span className="panel-header">decay</span>
          <span className={cx('font-mono text-2xs font-semibold', decayToneClass(authorityDecay))}>
            {(authorityDecay * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {/* Truth score bar — hidden on mobile */}
      <div className="hidden lg:flex items-center gap-1.5 shrink-0">
        <span className="panel-header">truth</span>
        <div className="w-16 h-1.5 bg-elevated rounded-full overflow-hidden">
          <div
            className={cx(
              'h-full rounded-full transition-calm',
              widthPctClass(truthScore),
              truthScoreClass(truthScore),
            )}
          />
        </div>
        <span className="panel-header font-mono">{(truthScore * 100).toFixed(0)}%</span>
      </div>

      <div className="hidden lg:block w-px h-4 bg-border" />

      {/* Probability display */}
      <div className="flex items-center gap-3 font-mono text-xs shrink-0">
        <span className="text-secondary font-medium">SYS</span>
        <span className="text-primary text-sm md:text-base font-bold tracking-tight">{(estProb * 100).toFixed(1)}%</span>
        <span className="text-muted">vs</span>
        <span className="text-secondary font-medium">MKT</span>
        <span className="text-primary text-sm font-semibold">{(marketProb * 100).toFixed(1)}%</span>
        <span className={cx('font-semibold transition-calm', edgeClass(edge))}>
          {edge > 0 ? '+' : ''}{(edge * 100).toFixed(2)}% edge
        </span>
      </div>

      <div className="hidden lg:block w-px h-4 bg-border" />

      {/* Regime — hidden on mobile */}
      <div className="hidden lg:flex items-center gap-1.5 shrink-0">
        <span className="panel-header">regime</span>
        <span className="font-mono text-xs text-secondary uppercase">{prob?.regime ?? '—'}</span>
      </div>

      <div className="flex-1" />

      {/* Snapshot ID */}
      <span className="font-mono text-2xs text-muted tracking-widest hidden lg:block">
        snap:{snapshotId}
      </span>

      <div className="w-px h-4 bg-border" />

      {/* Connection dot */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cx('w-1.5 h-1.5 rounded-full transition-calm', isConnected ? 'bg-green shadow-glow-green' : 'bg-red shadow-glow-red')} />
        <span className="panel-header">{isConnected ? 'live' : 'offline'}</span>
      </div>
    </header>
  );
}

function systemStatePillClass(systemState: string): string {
  switch (systemState) {
    case 'nominal':
      return 'text-green border-green/20';
    case 'cautious':
      return 'text-yellow border-yellow/20';
    case 'degraded':
      return 'text-yellow border-yellow/25';
    case 'halted':
      return 'text-red border-red/20';
    default:
      return 'text-neutral border-neutral/20';
  }
}

function systemStateDotClass(systemState: string): string {
  switch (systemState) {
    case 'nominal':
      return 'bg-green';
    case 'cautious':
      return 'bg-yellow';
    case 'degraded':
      return 'bg-yellow';
    case 'halted':
      return 'bg-red';
    default:
      return 'bg-neutral';
  }
}

function epistemicGradeClass(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-green border-current';
    case 'B':
      return 'text-secondary border-current';
    case 'C':
      return 'text-yellow border-current';
    default:
      return 'text-red border-current';
  }
}

function truthScoreClass(score: number): string {
  if (score > 0.7) {
    return 'bg-green';
  }
  if (score > 0.45) {
    return 'bg-yellow';
  }
  return 'bg-red';
}

function edgeClass(edge: number): string {
  if (edge > 0) {
    return 'text-green';
  }
  if (edge < 0) {
    return 'text-red';
  }
  return 'text-muted';
}

function scoreToneClass(score: number): string {
  if (score > 0.7) {
    return 'text-green';
  }
  if (score > 0.45) {
    return 'text-yellow';
  }
  return 'text-red';
}

function decayToneClass(decay: number): string {
  if (decay > 0.75) {
    return 'text-red';
  }
  if (decay > 0.55) {
    return 'text-yellow';
  }
  return 'text-green';
}
