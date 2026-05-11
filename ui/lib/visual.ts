function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function bucketPercent(value: number): number {
  return Math.round(clampUnit(value) * 10) * 10;
}

export function widthPctClass(value: number): string {
  return `w-pct-${bucketPercent(value)}`;
}

export function heightPctClass(value: number): string {
  return `h-pct-${bucketPercent(value)}`;
}

export function leftPctClass(value: number): string {
  return `left-pct-${bucketPercent(value)}`;
}

const HEAT_INTENSITY_CLASSES = [
  'opacity-40',
  'opacity-50',
  'opacity-60',
  'opacity-70',
  'opacity-80',
  'opacity-90',
  'opacity-100',
  'opacity-100',
  'opacity-100',
  'opacity-100',
] as const;

export function heatOpacityClass(rank: number): string {
  return HEAT_INTENSITY_CLASSES[Math.max(0, Math.min(HEAT_INTENSITY_CLASSES.length - 1, rank))] ?? 'opacity-100';
}
