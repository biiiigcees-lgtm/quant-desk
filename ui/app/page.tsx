'use client';

import { useMemo } from 'react';
import { useSystemState } from '../lib/hooks/useSystemState';
import { TopBar } from '../components/TopBar';
import { LeftPanel } from '../components/panels/LeftPanel';
import { CenterPanel } from '../components/panels/CenterPanel';
import { RightPanel } from '../components/panels/RightPanel';
import { BottomPanel } from '../components/panels/BottomPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MobileContent, MobileDecisionBar } from '../components/MobileLayout';

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
    systemAlert === 'critical' ? 'ring-2 ring-red/50' : '',
    systemAlert === 'warning' ? 'ring-1 ring-yellow/30' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {/* ── Mobile layout (< md) ─────────────────────────────────────────── */}
      <div
        className="md:hidden h-screen flex flex-col bg-base overflow-hidden"
        data-alert={dataAlert}
      >
        <TopBar state={state} isConnected={isConnected} />
        <div className="flex-1 overflow-y-auto min-h-0">
          <ErrorBoundary>
            <MobileContent state={state} />
          </ErrorBoundary>
        </div>
        <MobileDecisionBar state={state} />
      </div>

      {/* ── Desktop layout (≥ md) ────────────────────────────────────────── */}
      <div
        className="hidden md:flex flex-col h-screen bg-base overflow-hidden"
        data-alert={dataAlert}
      >
        <TopBar state={state} isConnected={isConnected} />
        <div className={desktopMiddleClass}>
          <ErrorBoundary><LeftPanel state={state} /></ErrorBoundary>
          <ErrorBoundary><CenterPanel state={state} /></ErrorBoundary>
          <ErrorBoundary><RightPanel state={state} /></ErrorBoundary>
        </div>
        <ErrorBoundary><BottomPanel state={state} /></ErrorBoundary>
      </div>
    </>
  );
}
