export class KalmanFilter {
  private x: number; // State estimate (trend)
  private P: number; // Error covariance
  private Q: number; // Process noise variance
  private R: number; // Measurement noise variance

  constructor(
    initialPrice: number,
    processVar: number = 1,
    measurementVar: number = 1
  ) {
    this.x = initialPrice;
    this.P = 1;
    this.Q = processVar;
    this.R = measurementVar;
  }

  predict(): void {
    // Predict step: state prediction
    this.P += this.Q;
  }

  update(measurement: number): number {
    // Update step: measurement update
    const K = this.P / (this.P + this.R); // Kalman gain
    this.x += K * (measurement - this.x);
    this.P = (1 - K) * this.P;
    return this.x;
  }

  getState(): number {
    return this.x;
  }

  getErrorCovariance(): number {
    return this.P;
  }

  getInnovation(measurement: number): number {
    return measurement - this.x;
  }

  reset(newPrice: number): void {
    this.x = newPrice;
    this.P = 1;
  }

  setProcessNoise(variance: number): void {
    this.Q = variance;
  }

  setMeasurementNoise(variance: number): void {
    this.R = variance;
  }
}

export class MultiStateKalmanFilter {
  private filters: Map<string, KalmanFilter> = new Map();

  addSymbol(symbol: string, initialPrice: number): void {
    this.filters.set(symbol, new KalmanFilter(initialPrice));
  }

  update(symbol: string, price: number): number | null {
    const filter = this.filters.get(symbol);
    if (!filter) return null;
    
    filter.predict();
    return filter.update(price);
  }

  getTrend(symbol: string): number | null {
    const filter = this.filters.get(symbol);
    return filter ? filter.getState() : null;
  }

  getDeviation(symbol: string, price: number): number | null {
    const filter = this.filters.get(symbol);
    return filter ? filter.getInnovation(price) : null;
  }

  hasSymbol(symbol: string): boolean {
    return this.filters.has(symbol);
  }

  removeSymbol(symbol: string): void {
    this.filters.delete(symbol);
  }
}

export function detectTrendChange(
  currentPrice: number,
  kalmanEstimate: number,
  threshold: number = 0.01
): 'UP' | 'DOWN' | 'NEUTRAL' {
  const deviation = (currentPrice - kalmanEstimate) / kalmanEstimate;
  
  if (deviation > threshold) return 'UP';
  if (deviation < -threshold) return 'DOWN';
  return 'NEUTRAL';
}

export function computeKalmanVelocity(
  currentEstimate: number,
  previousEstimate: number,
  timeDelta: number
): number {
  if (timeDelta === 0) return 0;
  return (currentEstimate - previousEstimate) / timeDelta;
}
