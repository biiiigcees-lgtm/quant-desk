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
      refreshInterval: intervalMs,
      revalidateOnFocus: false,
      dedupingInterval: intervalMs,
    },
  );

  return {
    state: data ?? null,
    isLoading,
    isError: !!error,
  };
}
