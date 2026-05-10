E = 2.718281828459045


class LogisticFeatures:
    def __init__(
        self,
        probability_velocity: float,
        obi: float,
        volatility: float,
        spread_expansion: float,
        sweep_probability: float,
        time_to_expiry: float,
        pressure_acceleration: float,
    ):
        self.probability_velocity = probability_velocity
        self.obi = obi
        self.volatility = volatility
        self.spread_expansion = spread_expansion
        self.sweep_probability = sweep_probability
        self.time_to_expiry = time_to_expiry
        self.pressure_acceleration = pressure_acceleration


def infer_probability(x: LogisticFeatures) -> tuple[float, tuple[float, float], float]:
    z = (
        -0.03
        + 1.5 * x.probability_velocity
        + 1.2 * x.obi
        - 0.9 * x.volatility
        - 0.7 * x.spread_expansion
        - 0.4 * x.sweep_probability
        - 0.0004 * x.time_to_expiry
        + 0.8 * x.pressure_acceleration
    )
    p = 1.0 / (1.0 + (E ** (-z)))
    uncertainty = max(0.01, min(1.0, 1.0 - abs(p - 0.5) * 2.0))
    width = 0.12 + uncertainty * 0.2
    ci = (max(0.0, p - width / 2.0), min(1.0, p + width / 2.0))
    return p, ci, uncertainty
