export function buildSyntheticScenario(contractId, points = 120) {
    const start = Date.now();
    const data = [];
    let price = 0.5;
    for (let i = 0; i < points; i++) {
        const drift = Math.sin(i / 10) * 0.01;
        const noise = ((i * 17) % 11 - 5) / 1000;
        price = Math.max(0.05, Math.min(0.95, price + drift + noise));
        data.push({
            contractId,
            yesPrice: price,
            noPrice: 1 - price,
            impliedProb: price,
            volume: 100 + i,
            timestamp: start + i * 1000,
            bids: [[price - 0.01, 100]],
            asks: [[price + 0.01, 100]],
        });
    }
    return data;
}
