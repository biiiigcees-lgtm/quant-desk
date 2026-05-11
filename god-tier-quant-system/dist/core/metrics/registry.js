export class MetricsRegistry {
    constructor() {
        this.series = new Map();
    }
    record(event) {
        const values = this.series.get(event.name) ?? [];
        values.push(event.value);
        if (values.length > 5000) {
            values.shift();
        }
        this.series.set(event.name, values);
    }
    latest(name) {
        const values = this.series.get(name);
        if (!values || values.length === 0) {
            return null;
        }
        return values[values.length - 1];
    }
    mean(name) {
        const values = this.series.get(name);
        if (!values || values.length === 0) {
            return null;
        }
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }
}
