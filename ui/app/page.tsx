'use client';

import { useMemo } from 'react';
import { useSystemState } from '../lib/hooks/useSystemState';
import { TopBar } from '../components/TopBar';
import { LeftPanel } from '../components/panels/LeftPanel';
import { CenterPanel } from '../components/panels/CenterPanel';
import { RightPanel } from '../components/panels/RightPanel';
import { BottomPanel } from '../components/panels/BottomPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MobileDashboard } from '../components/MobileDashboard';
import { MobileDecisionBar } from '../components/MobileDecisionBar';

export default function Page() {
  const { state, isLoading, isError } = useSystemState(500);
  const hasConnectionIssue = isError || isLoading;
  const isConnected = hasConnectionIssue === false;

  const systemAlert = useMemo((): 'critical' | 'warning' | 'nominal' => {
    const systemState = state?.realitySnapshot?.systemState;
    const adversarialScore = state?.adversarialAudit?.adversarialScore ?? 0;
    if (systemState === 'halted' || adversarialScore > 0.8) return 'critical';
    if (systemState === 'cautious' || systemState === 'degraded' || adversarialScore > 0.5) return 'warning';
    return 'nominal';
  }, [state]);

  const dataAlert = systemAlert === 'nominal' ? undefined : systemAlert;

  const desktopMiddleClass = [
    'flex flex-1 min-h-0 overflow-hidden',
    systemAlert === 'critical' ? 'ring-1 ring-red/30' : '',
    systemAlert === 'warning' ? 'ring-1 ring-yellow/20' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className="flex min-h-screen flex-col bg-base overflow-x-hidden md:h-screen"
      data-alert={dataAlert}
    >
      <TopBar state={state} isConnected={isConnected} />
      <div className="md:hidden flex-1 overflow-y-auto px-2 py-2 pb-24">
        <ErrorBoundary><MobileDashboard state={state} /></ErrorBoundary>
      </div>
      <div className={`${desktopMiddleClass} hidden md:flex`}>
        <ErrorBoundary><LeftPanel state={state} /></ErrorBoundary>
        <ErrorBoundary><CenterPanel state={state} /></ErrorBoundary>
        <ErrorBoundary><RightPanel state={state} /></ErrorBoundary>
      </div>
      <div className="hidden md:block">
        <ErrorBoundary><BottomPanel state={state} /></ErrorBoundary>
      </div>
      <ErrorBoundary><MobileDecisionBar state={state} /></ErrorBoundary>
    </div>
  );
}
