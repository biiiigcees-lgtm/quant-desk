'use client';

import { useMemo } from 'react';
import { useSystemState } from '../lib/hooks/useSystemState';
import { TopBar } from '../components/TopBar';
import { LeftPanel } from '../components/panels/LeftPanel';
import { CenterPanel } from '../components/panels/CenterPanel';
import { RightPanel } from '../components/panels/RightPanel';
import { BottomPanel } from '../components/panels/BottomPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function Page() {
  const { state, isLoading, isError } = useSystemState(500);

  // Adaptive cognitive alert level derived from live system state.
  const systemAlert = useMemo((): 'critical' | 'warning' | 'nominal' => {
    const systemState = state?.realitySnapshot?.systemState;
    const adversarialScore = state?.adversarialAudit?.adversarialScore ?? 0;

    if (systemState === 'halted' || adversarialScore > 0.8) return 'critical';
    if (
      systemState === 'cautious' ||
      systemState === 'degraded' ||
      adversarialScore > 0.5
    )
      return 'warning';
    return 'nominal';
  }, [state]);

  const mainContainerClass = [
    'flex flex-1 min-h-0 overflow-hidden',
    systemAlert === 'critical' ? 'ring-2 ring-red/50' : '',
    systemAlert === 'warning' ? 'ring-1 ring-yellow/30' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="flex flex-col h-screen bg-base overflow-hidden"
      data-alert={systemAlert !== 'nominal' ? systemAlert : undefined}
    >
      <TopBar state={state} isConnected={!isError && !isLoading} />
      <div className={mainContainerClass}>
        <ErrorBoundary><LeftPanel state={state} /></ErrorBoundary>
        <ErrorBoundary><CenterPanel state={state} /></ErrorBoundary>
        <ErrorBoundary><RightPanel state={state} /></ErrorBoundary>
      </div>
      <ErrorBoundary><BottomPanel state={state} /></ErrorBoundary>
    </div>
  );
}
