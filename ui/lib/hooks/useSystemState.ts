'use client';

import useSWR from 'swr';
import type { SystemStateSnapshot } from '../types';

const fetcher = (url: string) => fetch(url).then((r) => r.json()) as Promise<SystemStateSnapshot>;

export function useSystemState(intervalMs = 500) {
  const { data, error, isLoading } = useSWR<SystemStateSnapshot>(
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
