export function walkForwardSplit(data, trainRatio = 0.7) {
    const split = Math.max(1, Math.min(data.length - 1, Math.floor(data.length * trainRatio)));
    return {
        train: data.slice(0, split),
        test: data.slice(split),
    };
}
