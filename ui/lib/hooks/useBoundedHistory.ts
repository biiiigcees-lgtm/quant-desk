import { useRef, useCallback } from 'react';

/**
 * Maintains a bounded circular history buffer.
 *
 * @param maxSize - Maximum number of entries to retain; oldest entries are evicted.
 * @returns Stable `push`, `getAll`, `clear`, and `size` functions via useCallback.
 */
export function useBoundedHistory<T>(maxSize: number) {
  const bufferRef = useRef<T[]>([]);

  const push = useCallback(
    (item: T): T[] => {
      bufferRef.current = [...bufferRef.current.slice(-(maxSize - 1)), item];
      return bufferRef.current;
    },
    [maxSize],
  );

  const getAll = useCallback((): readonly T[] => bufferRef.current, []);

  const clear = useCallback((): void => {
    bufferRef.current = [];
  }, []);

  const size = useCallback((): number => bufferRef.current.length, []);

  return { push, getAll, clear, size };
}
