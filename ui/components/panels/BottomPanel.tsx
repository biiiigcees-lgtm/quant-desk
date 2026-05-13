'use client';

import React from 'react';
import { cx } from '../../lib/cx';
import type { SystemStateSnapshot } from '../../lib/types';
import { heightPctClass, widthPctClass } from '../../lib/visual';

interface Props { state: SystemStateSnapshot | null }

const EXECUTION_PHASES = ['idle', 'planning', 'simulating', 'executing', 'filled'] as const;
type ExecPhase = typeof EXECUTION_PHASES[number];

type CandidatePlan = {
  name: string;
  kl: number;
  best: boolean;
};

function mapPhaseToFlow(rawPhase: string | undefined): ExecPhase {
  if (!rawPhase) return 'idle';
  if (rawPhase === 'created') return 'planning';
  if (rawPhase === 'submitted' || rawPhase === 'routed' || rawPhase === 'acknowledged') return 'simulating';
  if (rawPhase === 'partial' || rawPhase === 'partially_filled') return 'executing';
  if (rawPhase === 'filled') return 'filled';
  return 'idle';
}

export function BottomPanel({ state }: Readonly<Props>) {
  const execState = state?.executionState;
  const execControl = state?.executionControl;
  const simUniverse = state?.simulationUniverse;
  const scenario = state?.scenarioBranchState;
  const meta = state?.metaCalibration;
  const world = state?.marketWorldState;
  const currentPhase = mapPhaseToFlow(execState?.phase);
  const modeColor = executionModeColor(execControl?.mode);

  const candidateData = simUniverse?.candidateDivergences
    ? Object.entries(simUniverse.candidateDivergences).map(([name, val]) => ({
        name: name.replace('-', ' '),
        kl: Number(val.toFixed(4)),
        best: name === simUniverse.bestCandidatePlan,
      }))
    : [];

  return (
    <footer className="flex h-[28%] bg-surface panel-border shrink-0 overflow-x-auto md:overflow-hidden divide-x divide-border">
      {/* Execution state machine */}
      <div className="flex flex-col w-[22%] p-3 overflow-hidden">
        <span className="panel-header mb-2">execution state machine</span>
        <div className="flex-1 flex flex-col justify-center">
          <StateMachine currentPhase={currentPhase} />
        </div>
        {execState && (
          <div className="mt-2 font-mono text-2xs text-muted truncate">{execState.reason}</div>
        )}
      </div>

      {/* Fill tracker */}
      <div className="flex flex-col w-[22%] p-3 overflow-hidden">
        <span className="panel-header mb-2">execution truth</span>
        <div className="space-y-1 overflow-y-auto flex-1">
          <FillRow label="mode" value={execControl?.mode ?? 'normal'} color={modeColor} />
          <FillRow label="phase" value={execState?.phase === 'blocked' ? 'idle' : (execState?.phase ?? 'idle')} color="#E6EDF3" />
          <FillRow label="safety" value={execState?.safetyMode ?? '—'} color="#6B7C93" />
        </div>
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex justify-between">
            <span className="panel-header">mirror confidence</span>
            <span className="font-mono text-xs text-primary">{((simUniverse?.mirrorConfidence ?? 0) * 100).toFixed(0)}%</span>
          </div>
          <div className="w-full h-1 bg-elevated rounded-full mt-1 overflow-hidden">
            <div
              className={cx(
                'h-full rounded-full',
                widthPctClass(simUniverse?.mirrorConfidence ?? 0),
                (simUniverse?.mirrorConfidence ?? 0) > 0.7 ? 'bg-green' : 'bg-yellow',
              )}
            />
          </div>
        </div>
      </div>

      {/* KL divergence bar chart */}
      <div className="flex flex-col flex-1 p-3 overflow-hidden">
        <div className="flex items-baseline justify-between mb-2">
          <span className="panel-header">execution path divergence</span>
          {simUniverse?.bestCandidatePlan && (
            <span className="font-mono text-2xs text-green">best: {simUniverse.bestCandidatePlan}</span>
          )}
        </div>
        {candidateData.length > 0 ? (
          <CandidateBars data={candidateData} />
        ) : (
          <PlaceholderBars />
        )}
      </div>

      {/* Simulation stats */}
      <div className="flex flex-col w-[22%] p-3 overflow-hidden">
        <span className="panel-header mb-2">simulation universe</span>
        <div className="space-y-1.5 flex-1">
          <SimStat label="scenarios" value={`${simUniverse?.scenarioCount ?? 0}`} />
          <SimStat label="worst PnL" value={`$${(simUniverse?.worstCasePnl ?? 0).toFixed(2)}`} color={simUniverse && simUniverse.worstCasePnl < -10 ? '#FF4D4D' : '#FFB020'} />
          <SimStat label="tail prob" value={`${((simUniverse?.tailProbability ?? 0) * 100).toFixed(2)}%`} />
          <SimStat label="path div" value={(simUniverse?.executionPathDivergence ?? 0).toFixed(4)} />
          <SimStat label="branch vol" value={`${((scenario?.volatilityWeight ?? 0) * 100).toFixed(0)}%`} color={scenario?.invalidated ? '#FF4D4D' : '#E6EDF3'} />
          <SimStat label="authority" value={`${((meta?.authorityDecay ?? 0) * 100).toFixed(0)}%`} color={authorityToneColor(meta?.authorityDecay ?? 0)} />
        </div>
        {simUniverse && (
          <div className="mt-2 pt-2 border-t border-border font-mono text-2xs text-muted">
            best: {simUniverse.bestCandidatePlan ?? '—'}
          </div>
        )}
      </div>

      {/* Reality factor decomposition */}
      <div className="flex flex-col w-[18%] p-3 overflow-hidden">
        <span className="panel-header mb-2">reality factors</span>
        <div className="space-y-1.5 flex-1">
          <FactorBar label="cal" value={state?.realitySnapshot?.calibrationFactor ?? 0} />
          <FactorBar label="drift" value={state?.realitySnapshot?.driftFactor ?? 0} />
          <FactorBar label="anomaly" value={state?.realitySnapshot?.anomalyFactor ?? 0} />
          <FactorBar label="belief" value={state?.realitySnapshot?.beliefFactor ?? 0} />
        </div>
        <div className="mt-1 font-mono text-2xs text-secondary truncate">
          {world ? `${world.participantIntent} | reflex ${(world.reflexivityAcceleration * 100).toFixed(0)}%` : 'world model pending'}
        </div>
        <div className="mt-2 pt-2 border-t border-border flex justify-between">
          <span className="panel-header">truth</span>
          <span className={cx('font-mono text-xs font-semibold', truthScoreToneClass(state?.realitySnapshot?.truthScore ?? 0))}>
            {((state?.realitySnapshot?.truthScore ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </footer>
  );
}

const StateMachine = React.memo(function StateMachine({ currentPhase }: Readonly<{ currentPhase: ExecPhase }>) {
  const phases = EXECUTION_PHASES;

  return (
    <div className="flex flex-col gap-1">
      {phases.map((phase, i) => {
        const isActive = phase === currentPhase;
        const markerClass = phaseMarkerClass(isActive, phase);
        const labelClass = phaseLabelClass(isActive, phase);
        return (
          <div key={phase} className="flex items-center gap-2">
            {i > 0 && <div className="absolute" />}
            <div className={cx('w-2 h-2 rounded-full shrink-0', markerClass)} />
            <span className={cx('font-mono text-2xs capitalize', labelClass)}>
              {phase}
            </span>
          </div>
        );
      })}
    </div>
  );
});

const FillRow = React.memo(function FillRow({ label, value, color = '#E6EDF3' }: Readonly<{ label: string; value: string; color?: string }>) {
  const toneClass = colorToTextClass(color);
  return (
    <div className="flex items-center justify-between">
      <span className="panel-header">{label}</span>
      <span className={cx('font-mono text-2xs uppercase', toneClass)}>{value}</span>
    </div>
  );
});

const SimStat = React.memo(function SimStat({ label, value, color = '#E6EDF3' }: Readonly<{ label: string; value: string; color?: string }>) {
  const toneClass = colorToTextClass(color);
  return (
    <div className="flex items-center justify-between">
      <span className="panel-header">{label}</span>
      <span className={cx('font-mono text-xs', toneClass)}>{value}</span>
    </div>
  );
});

const FactorBar = React.memo(function FactorBar({ label, value }: Readonly<{ label: string; value: number }>) {
  const fillClass = factorFillClass(value);
  const toneClass = factorTextClass(value);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-2xs text-muted w-10">{label}</span>
      <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full', widthPctClass(value), fillClass)} />
      </div>
      <span className={cx('font-mono text-2xs', toneClass)}>{(value * 100).toFixed(0)}</span>
    </div>
  );
});

const PlaceholderBars = React.memo(function PlaceholderBars() {
  const data: CandidatePlan[] = [
    { name: 'market aggressive', kl: 0.12, best: false },
    { name: 'passive patient', kl: 0.08, best: false },
    { name: 'sliced vwap', kl: 0.05, best: false },
    { name: 'reduced half', kl: 0.09, best: false },
  ];

  return <CandidateBars data={data} />;
});

function CandidateBars({ data }: Readonly<{ data: CandidatePlan[] }>) {
  const maxKl = Math.max(...data.map((entry) => entry.kl), 0.0001);

  return (
    <div className="flex items-end gap-2 h-full min-h-0">
      {data.map((entry) => {
        const normalizedHeight = maxKl > 0 ? entry.kl / maxKl : 0;

        return (
          <div key={`${entry.name}-${entry.kl}`} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full">
            <div className="w-full flex-1 bg-elevated rounded-sm flex items-end overflow-hidden">
              <div
                className={cx(
                  'w-full rounded-sm transition-all duration-300',
                  heightPctClass(normalizedHeight),
                  entry.best ? 'bg-green' : 'bg-border',
                )}
                title={`${entry.name}: ${entry.kl.toFixed(4)} KL`}
              />
            </div>
            <span className={cx('font-mono text-2xs truncate w-full text-center', entry.best ? 'text-green' : 'text-muted')}>
              {entry.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function truthScoreToneClass(score: number): string {
  if (score > 0.7) {
    return 'text-green';
  }
  if (score > 0.45) {
    return 'text-yellow';
  }
  return 'text-red';
}

function colorToTextClass(color: string): string {
  switch (color) {
    case '#00E5A8':
      return 'text-green';
    case '#FFB020':
      return 'text-yellow';
    case '#FF4D4D':
      return 'text-red';
    case '#6B7C93':
      return 'text-neutral';
    default:
      return 'text-primary';
  }
}

function executionModeColor(mode: string | undefined): string {
  if (mode === 'hard-stop') {
    return '#FF4D4D';
  }
  if (mode === 'safe-mode') {
    return '#FFB020';
  }
  return '#00E5A8';
}

function phaseMarkerClass(isActive: boolean, phase: ExecPhase): string {
  if (!isActive) {
    return 'bg-border';
  }
  return 'bg-green shadow-glow-green ring-2 ring-green/40 ring-offset-1 ring-offset-base';
}

function phaseLabelClass(isActive: boolean, phase: ExecPhase): string {
  if (!isActive) {
    return 'text-muted';
  }
  return 'text-green';
}

function factorFillClass(value: number): string {
  if (value > 0.7) {
    return 'bg-green';
  }
  if (value > 0.4) {
    return 'bg-yellow';
  }
  return 'bg-red';
}

function factorTextClass(value: number): string {
  if (value > 0.7) {
    return 'text-green';
  }
  if (value > 0.4) {
    return 'text-yellow';
  }
  return 'text-red';
}

function authorityToneColor(authorityDecay: number): string {
  if (authorityDecay > 0.75) {
    return '#FF4D4D';
  }
  if (authorityDecay > 0.55) {
    return '#FFB020';
  }
  return '#00E5A8';
}
