def classify_regime(volatility: float, spread_expansion: float, obi_velocity: float, panic_repricing: bool) -> str:
    if panic_repricing:
        return "panic"
    if spread_expansion > 0.7:
        return "low-liquidity"
    if volatility < 0.01 and spread_expansion < 0.2:
        return "compression"
    if volatility > 0.04:
        return "expansion"
    if abs(obi_velocity) > 0.2:
        return "momentum-ignition"
    if volatility < 0.02:
        return "choppy"
    return "trending"
