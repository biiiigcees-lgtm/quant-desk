import type { SystemStateSnapshot } from './types';

export function coerceSystemState(raw: unknown): SystemStateSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const snapshot = raw as SystemStateSnapshot;
  const reality = snapshot.realitySnapshot;
  if (reality) {
    if (!isNonEmptyString(reality.canonicalSnapshotId)) {
      return null;
    }
    if (!isFiniteInRange(reality.truthScore, 0, 1)) {
      return null;
    }
    if (!isFiniteInRange(reality.calibrationFactor, 0, 1)) {
      return null;
    }
    if (!isFiniteInRange(reality.driftFactor, 0, 1)) {
      return null;
    }
    if (!isFiniteInRange(reality.anomalyFactor, 0, 1)) {
      return null;
    }
    if (!isFiniteInRange(reality.beliefFactor, 0, 1)) {
      return null;
    }
    if (!isPositiveNumber(reality.timestamp)) {
      return null;
    }
  }

  if (snapshot.executionControl) {
    if (!isPositiveNumber(snapshot.executionControl.timestamp)) {
      return null;
    }
    if (!isNonEmptyString(snapshot.executionControl.reason)) {
      return null;
    }
  }

  if (snapshot.probability) {
    if (!isPositiveNumber(snapshot.probability.timestamp)) {
      return null;
    }
    if (!isFiniteInRange(snapshot.probability.estimatedProbability, 0, 1)) {
      return null;
    }
    if (!isFiniteInRange(snapshot.probability.marketImpliedProbability, 0, 1)) {
      return null;
    }
  }

  return snapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
