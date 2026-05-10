'use client';

import { useSystemState } from '@/lib/hooks/useSystemState';
import { TopBar } from '@/components/TopBar';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { CenterPanel } from '@/components/panels/CenterPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { BottomPanel } from '@/components/panels/BottomPanel';

export default function Page() {
  const { state, isLoading, isError } = useSystemState(500);

  return (
    <div className="flex flex-col h-screen bg-base overflow-hidden">
      <TopBar state={state} isConnected={!isError && !isLoading} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LeftPanel state={state} />
        <CenterPanel state={state} />
        <RightPanel state={state} />
      </div>
      <BottomPanel state={state} />
    </div>
  );
}
