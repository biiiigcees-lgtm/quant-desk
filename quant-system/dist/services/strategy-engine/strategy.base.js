export class Strategy {
    constructor(name) {
        this.name = name;
    }
    getName() {
        return this.name;
    }
    clampConfidence(value) {
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            return 0;
        }
        return Math.max(0, Math.min(1, value));
    }
}
