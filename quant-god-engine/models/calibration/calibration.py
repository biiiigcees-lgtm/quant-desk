from dataclasses import dataclass, field


@dataclass
class CalibrationTracker:
    pairs: list[tuple[float, float]] = field(default_factory=list)

    def observe(self, predicted: float, realized: float) -> None:
        self.pairs.append((predicted, realized))
        if len(self.pairs) > 5000:
            self.pairs.pop(0)

    def ece(self) -> float:
        if not self.pairs:
            return 0.0
        return sum(abs(p - r) for p, r in self.pairs) / len(self.pairs)

    def brier(self) -> float:
        if not self.pairs:
            return 0.0
        return sum((p - r) ** 2 for p, r in self.pairs) / len(self.pairs)

    def platt_scale(self, raw: float, a: float = 1.0, b: float = 0.0) -> float:
        import math

        z = a * raw + b
        return 1.0 / (1.0 + math.exp(-z))
