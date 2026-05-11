from dataclasses import dataclass


@dataclass
class Evidence:
    momentum: float
    volatility: float
    order_flow: float
    time_decay: float


def bayes_update(prior: float, evidence: Evidence) -> float:
    likelihood = max(0.01, min(0.99, (evidence.momentum + evidence.volatility + evidence.order_flow + evidence.time_decay) / 4.0))
    marginal = likelihood * prior + (1.0 - likelihood) * (1.0 - prior)
    if marginal <= 0:
        return prior
    posterior = (likelihood * prior) / marginal
    return max(0.01, min(0.99, posterior))
