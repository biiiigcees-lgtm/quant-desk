export class CalibrationLayer {
    constructor() {
        this.plattA = 1;
        this.plattB = 0;
        this.reliabilityBins = [];
    }
    calibrate(rawProbability) {
        const z = this.plattA * rawProbability + this.plattB;
        return 1 / (1 + Math.exp(-z));
    }
    observe(predicted, realized) {
        this.reliabilityBins.push({ predicted, realized });
        if (this.reliabilityBins.length > 1000) {
            this.reliabilityBins.shift();
        }
    }
    expectedCalibrationError() {
        if (this.reliabilityBins.length === 0)
            return 0;
        const abs = this.reliabilityBins.map((bin) => Math.abs(bin.predicted - bin.realized));
        return abs.reduce((sum, value) => sum + value, 0) / abs.length;
    }
    brierScore() {
        if (this.reliabilityBins.length === 0)
            return 0;
        const sq = this.reliabilityBins.map((bin) => (bin.predicted - bin.realized) ** 2);
        return sq.reduce((sum, value) => sum + value, 0) / sq.length;
    }
}
