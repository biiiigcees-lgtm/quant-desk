export class CalibrationLayer {
  private readonly plattA = 1;
  private readonly plattB = 0;
  private readonly reliabilityBins: Array<{ predicted: number; realized: number }> = [];

  calibrate(rawProbability: number): number {
    const z = this.plattA * rawProbability + this.plattB;
    return 1 / (1 + Math.exp(-z));
  }

  observe(predicted: number, realized: number): void {
    this.reliabilityBins.push({ predicted, realized });
    if (this.reliabilityBins.length > 1000) {
      this.reliabilityBins.shift();
    }
  }

  expectedCalibrationError(): number {
    if (this.reliabilityBins.length === 0) return 0;
    const abs = this.reliabilityBins.map((bin) => Math.abs(bin.predicted - bin.realized));
    return abs.reduce((sum, value) => sum + value, 0) / abs.length;
  }

  brierScore(): number {
    if (this.reliabilityBins.length === 0) return 0;
    const sq = this.reliabilityBins.map((bin) => (bin.predicted - bin.realized) ** 2);
    return sq.reduce((sum, value) => sum + value, 0) / sq.length;
  }
}
