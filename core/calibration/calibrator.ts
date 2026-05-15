export interface CalibrationState {
  predictionErrors: number[];
  bias: number;
  calibrationScore: number;
  lastUpdated: number;
}

export function updateCalibration(state: CalibrationState, prediction: number, actual: number): CalibrationState {
  const error = prediction - actual;
  const errors = [...state.predictionErrors, error].slice(-100);
  
  const bias = errors.reduce((a, b) => a + b, 0) / errors.length;
  const mae = errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length;
  const calibrationScore = Math.max(0, 1 - mae);
  
  return {
    predictionErrors: errors,
    bias,
    calibrationScore,
    lastUpdated: Date.now(),
  };
}

export function applyCalibration(probability: number, bias: number): number {
  const adjusted = probability - bias;
  return Math.max(0, Math.min(1, adjusted));
}

export function getInitialCalibrationState(): CalibrationState {
  return {
    predictionErrors: [],
    bias: 0,
    calibrationScore: 0.5,
    lastUpdated: Date.now(),
  };
}
