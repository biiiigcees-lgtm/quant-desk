export interface WalkForwardSplit<T> {
  train: T[];
  test: T[];
}

export function walkForwardSplit<T>(data: T[], trainRatio: number = 0.7): WalkForwardSplit<T> {
  const split = Math.max(1, Math.min(data.length - 1, Math.floor(data.length * trainRatio)));
  return {
    train: data.slice(0, split),
    test: data.slice(split),
  };
}
