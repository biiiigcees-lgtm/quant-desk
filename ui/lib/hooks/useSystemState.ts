'use client';

import useSWR from 'swr';
import type { SystemStateSnapshot } from '../types';
import { coerceSystemState } from '../validation';

const fetcher = async (url: string): Promise<SystemStateSnapshot | null> => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return coerceSystemState(await res.json());
};

export function useSystemState(intervalMs = 500) {
  const { data, error, isLoading } = useSWR<SystemStateSnapshot | null>(
    '/god-tier/state',
    fetcher,
    {
      refreshInterval: (latest) => {
        const mode = deriveCognitiveMode(latest ?? null);
        if (mode === 'critical') {
          return Math.max(200, Math.floor(intervalMs / 2));
        }
        if (mode === 'focused') {
          return intervalMs;
        }
        return Math.max(intervalMs, 900);
      },
      revalidateOnFocus: false,
      dedupingInterval: intervalMs,
    },
  );

  const cognitiveMode = deriveCognitiveMode(data ?? null);

  return {
    state: data ?? null,
    cognitiveMode,
    isLoading,
    isError: !!error,
  };
}

function deriveCognitiveMode(state: SystemStateSnapshot | null): 'normal' | 'focused' | 'critical' {
  if (!state) {
    return 'normal';
  }

  const control = state.executionControl?.mode;
  const anomaly = state.anomaly?.severity;
  const uncertainty = state.realitySnapshot?.uncertaintyState;
  const authorityDecay = state.metaCalibration?.authorityDecay ?? 0;
  const trustDecay = state.systemConsciousness?.trustDecay ?? 0;

  if (
    control === 'hard-stop' ||
    anomaly === 'critical' ||
    uncertainty === 'extreme' ||
    authorityDecay > 0.8 ||
    trustDecay > 0.78
  ) {
    return 'critical';
  }
  if (
    control === 'safe-mode' ||
    anomaly === 'high' ||
    uncertainty === 'high' ||
    authorityDecay > 0.62 ||
    trustDecay > 0.58
  ) {
    return 'focused';
  }
  return 'normal';
}
