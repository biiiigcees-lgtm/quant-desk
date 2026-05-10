import type { SystemStateSnapshot } from './types';

export function coerceSystemState(raw: unknown): SystemStateSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  return raw as SystemStateSnapshot;
}
