'use client';

import { useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import type { SystemStateSnapshot } from '../types';
import { coerceSystemState } from '../validation';

const fetcher = async (url: string): Promise<SystemStateSnapshot | null> => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return coerceSystemState(await res.json());
};

export function useSystemState(intervalMs = 500) {
  // Track consecutive errors to drive adaptive poll intervals.
  const consecutiveErrorsRef = useRef(0);
  // Mirror in a ref so the visibilitychange handler can read the latest value
  // without being re-created on every render.
  const mutateRef = useRef<(() => void) | null>(null);

  // Increase the interval when the backend appears unhealthy.
  const effectiveInterval =
    consecutiveErrorsRef.current >= 3 ? 2_000 : intervalMs;

  const { data, error, isLoading, mutate } = useSWR<SystemStateSnapshot | null>(
    '/god-tier/state',
    fetcher,
    {
      refreshInterval: effectiveInterval,
      revalidateOnFocus: false,
      revalidateOnMount: true,
      revalidateIfStale: true,
      dedupingInterval: effectiveInterval,
      onSuccess: () => {
        consecutiveErrorsRef.current = 0;
      },
      onError: () => {
        consecutiveErrorsRef.current += 1;
      },
    },
  );

  // Keep the ref up-to-date so the visibilitychange listener below can call
  // the latest mutate without closing over a stale reference.
  mutateRef.current = mutate;

  // GC cycle: pause polling while the tab is hidden; resume on visibility.
  const handleVisibilityChange = useCallback(() => {
    if (!document.hidden && mutateRef.current) {
      // Tab became visible again — trigger an immediate revalidation so the
      // data is fresh before the next scheduled interval fires.
      mutateRef.current();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  return {
    state: data ?? null,
    isLoading,
    isError: !!error,
    consecutiveErrors: consecutiveErrorsRef.current,
  };
}
