'use client';

import clsx from 'clsx';
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { SystemStateSnapshot } from '@/lib/types';

interface Props { state: SystemStateSnapshot | null }

const EXECUTION_PHASES = ['idle', 'planning', 'simulating', 'executing', 'filled'] as const;
type ExecPhase = typeof EXECUTION_PHASES[number];

function mapPhaseToFlow(rawPhase: string | undefined): ExecPhase {
  if (!rawPhase) return 'idle';
  if (rawPhase === 'created') return 'planning';
  if (rawPhase === 'routed' || rawPhase === 'acknowledged') return 'simulating';
  if (rawPhase === 'partial') return 'executing';
  if (rawPhase === 'filled') return 'filled';
  return 'idle';
}

export function BottomPanel({ state }: Props) {
  const execState = state?.executionState;
  const execControl = state?.executionControl;
  const simUniverse = state?.simulationUniverse;
  const currentPhase = mapPhaseToFlow(execState?.phase ?? (execState?.phase === 'blocked' ? 'idle' : undefined));
  const isBlocked = execState?.phase === 'blocked' || execControl?.mode === 'hard-stop';

  const candidateData = simUniverse?.candidateDivergences
    ? Object.entries(simUniverse.candidateDivergences).map(([name, val]) => ({
        name: name.replace('-', ' '),
        kl: Number((val as number).toFixed(4)),
        best: name === simUniverse.bestCandidatePlan,
      }))
    : [];

  return (
    <footer className="flex h-[28%] bg-surface panel-border shrink-0 overflow-hidden divide-x divide-border">
      {/* Execution state machine */}
      <div className="flex flex-col w-[22%] p-3 overflow-hidden">
        <span className="panel-header mb-2">execution state machine</span>
        <div className="flex-1 flex flex-col justify-center">
          <StateMachine currentPhase={currentPhase} isBlocked={isBlocked} />
        </div>
        {execState && (
          <div className="mt-2 font-mono text-2xs text-muted truncate">{execState.reason}</div>
        )}
      </div>

      {/* Fill tracker */}
      <div className="flex flex-col w-[22%] p-3 overflow-hidden">
        <span className="panel-header mb-2">execution truth</span>
        <div className="space-y-1 overflow-y-auto flex-1">
          <FillRow label="mode" value={execControl?.mode ?? 'normal'} color={execControl?.mode === 'hard-stop' ? '#FF4D4D' : execControl?.mode === 'safe-mode' ? '#FFB020' : '#00E5A8'} />
          <FillRow label="phase" value={execState?.phase ?? 'idle'} color="#E6EDF3" />
          <FillRow label="safety" value={execState?.safetyMode ?? '—'} color="#6B7C93" />
        </div>
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex justify-between">
            <span className="panel-header">mirror confidence</span>
            <span className="font-mono text-xs text-primary">{((simUniverse?.mirrorConfidence ?? 0) * 100).toFixed(0)}%</span>
          </div>
          <div className="w-full h-1 bg-elevated rounded-full mt-1 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round((simUniverse?.mirrorConfidence ?? 0) * 100)}%`,
                backgroundColor: (simUniverse?.mirrorConfidence ?? 0) > 0.7 ? '#00E5A8' : '#FFB020',
              }}
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
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={candidateData} barGap={4} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
              <Bar dataKey="kl" radius={[2, 2, 0, 0]}>
                {candidateData.map((entry, i) => (
                  <Cell key={i} fill={entry.best ? '#00E5A8' : '#1E2D42'} />
                ))}
              </Bar>
              <Tooltip
                contentStyle={{ background: '#0F1629', border: '1px solid #1E2D42', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                formatter={(v: number) => [v.toFixed(4), 'KL div']}
              />
            </BarChart>
          </ResponsiveContainer>
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
        <div className="mt-2 pt-2 border-t border-border flex justify-between">
          <span className="panel-header">truth</span>
          <span className="font-mono text-xs font-semibold" style={{
            color: (state?.realitySnapshot?.truthScore ?? 0) > 0.7 ? '#00E5A8'
              : (state?.realitySnapshot?.truthScore ?? 0) > 0.45 ? '#FFB020'
              : '#FF4D4D',
          }}>
            {((state?.realitySnapshot?.truthScore ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </footer>
  );
}

function StateMachine({ currentPhase, isBlocked }: { currentPhase: ExecPhase; isBlocked: boolean }) {
  const phases = isBlocked ? ['idle', 'blocked'] : EXECUTION_PHASES;

  return (
    <div className="flex flex-col gap-1">
      {phases.map((phase, i) => {
        const isActive = phase === (isBlocked ? 'blocked' : currentPhase);
        const isPast = !isBlocked && EXECUTION_PHASES.indexOf(phase as ExecPhase) < EXECUTION_PHASES.indexOf(currentPhase);
        return (
          <div key={phase} className="flex items-center gap-2">
            {i > 0 && <div className="absolute" />}
            <div
              className={clsx('w-2 h-2 rounded-full shrink-0', isActive ? 'ring-2 ring-offset-1' : '')}
              style={{
                backgroundColor: isActive ? (phase === 'blocked' ? '#FF4D4D' : '#00E5A8') : '#1E2D42',
                boxShadow: isActive ? `0 0 8px ${phase === 'blocked' ? '#FF4D4D' : '#00E5A8'}` : 'none',
              }}
            />
            <span className={clsx(
              'font-mono text-2xs capitalize',
              isActive ? (phase === 'blocked' ? 'text-red' : 'text-green') : isPast ? 'text-muted' : 'text-muted',
            )}>
              {phase}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FillRow({ label, value, color = '#E6EDF3' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="panel-header">{label}</span>
      <span className="font-mono text-2xs uppercase" style={{ color }}>{value}</span>
    </div>
  );
}

function SimStat({ label, value, color = '#E6EDF3' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="panel-header">{label}</span>
      <span className="font-mono text-xs" style={{ color }}>{value}</span>
    </div>
  );
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const color = value > 0.7 ? '#00E5A8' : value > 0.4 ? '#FFB020' : '#FF4D4D';
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-2xs text-muted w-10">{label}</span>
      <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono text-2xs" style={{ color }}>{(value * 100).toFixed(0)}</span>
    </div>
  );
}

function PlaceholderBars() {
  const data = [
    { name: 'market aggressive', kl: 0.12 },
    { name: 'passive patient', kl: 0.08 },
    { name: 'sliced vwap', kl: 0.05 },
    { name: 'reduced half', kl: 0.09 },
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={4} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
        <Bar dataKey="kl" fill="#1E2D42" radius={[2, 2, 0, 0]} />
        <Tooltip
          contentStyle={{ background: '#0F1629', border: '1px solid #1E2D42', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          formatter={(v: number) => [v.toFixed(4), 'KL div']}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
