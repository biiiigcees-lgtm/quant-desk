import type { SystemStateSnapshot } from './types';

export function coerceSystemState(raw: unknown): SystemStateSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const snapshot = raw as SystemStateSnapshot;
  if (!isRealitySnapshotValid(snapshot.realitySnapshot)) {
    return null;
  }
  if (!isExecutionControlValid(snapshot.executionControl)) {
    return null;
  }
  if (!isProbabilityValid(snapshot.probability)) {
    return null;
  }

  return snapshot;
}

function isRealitySnapshotValid(reality: SystemStateSnapshot['realitySnapshot']): boolean {
  if (!reality) {
    return true;
  }

  return (
    isNonEmptyString(reality.canonicalSnapshotId)
    && isFiniteInRange(reality.truthScore, 0, 1)
    && isFiniteInRange(reality.calibrationFactor, 0, 1)
    && isFiniteInRange(reality.driftFactor, 0, 1)
    && isFiniteInRange(reality.anomalyFactor, 0, 1)
    && isFiniteInRange(reality.beliefFactor, 0, 1)
    && isPositiveNumber(reality.timestamp)
  );
}

function isExecutionControlValid(control: SystemStateSnapshot['executionControl']): boolean {
  if (!control) {
    return true;
  }

  return isPositiveNumber(control.timestamp) && isNonEmptyString(control.reason);
}

function isProbabilityValid(probability: SystemStateSnapshot['probability']): boolean {
  if (!probability) {
    return true;
  }

  return (
    isPositiveNumber(probability.timestamp)
    && isFiniteInRange(probability.estimatedProbability, 0, 1)
    && isFiniteInRange(probability.marketImpliedProbability, 0, 1)
  );
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
