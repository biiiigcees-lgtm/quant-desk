# Quant GOD Engine

Institutional-grade, event-driven probabilistic trading intelligence platform for Kalshi 15-minute binary event markets.

## Design Goals

- Adaptive strategy ecology with fitness-driven weighting
- Probability mispricing as first-class alpha primitive
- Regime-aware, microstructure-aware, execution-aware lifecycle
- Deterministic event flow with replay and reconciliation hooks
- AI observer layer with zero trade authority
- Survival-first risk posture for real-money deployment

## Architecture

```text
Market Data Layer
  -> Microstructure Engine
  -> Feature Engine
  -> Probability Pricing Engine (Bayesian + Logistic + Regime + Calibration)
  -> Strategy Ecology
  -> Signal Engine
  -> Adaptive Risk
  -> Execution Intelligence
  -> Simulation/Execution Adapter
  -> Portfolio Engine
  -> Reconciliation + Replay
  -> Anomaly Engine
  -> AI Intelligence (observer only)
```

## Repository Layout

```text
quant-god-engine/
  services/
  models/
  infra/
  core/
  apps/
  tests/
```

## Core Implemented Components

- `services/microstructure-engine/service.ts`
  - OBI, OBI velocity, liquidity pressure, spread expansion, sweep probability, panic repricing
- `services/probability-engine/*`
  - Bayesian update layer
  - Logistic probability layer with CI and uncertainty
  - Regime inference and probability adjustment
  - Calibration metrics (ECE/Brier)
- `services/strategy-ecology/*`
  - Multi-strategy ecosystem with continuous fitness scoring
- `services/adaptive-risk/service.ts`
  - Dynamic sizing + Monte Carlo ruin approximation
- `services/execution-intelligence/service.ts`
  - Market/passive/sliced planning + idempotency guardrails
- `services/replay-engine/service.ts`
  - Deterministic event recording/replay skeleton
- `services/ai-intelligence/*`
  - Persistent memory graph and non-authoritative market narratives

## API

- `GET /health`
- `GET /state`

## Local Run

```bash
cd quant-god-engine
npm install
npm run check
npm run build
npm start
```

## Smoke Test

```bash
cd quant-god-engine
node --enable-source-maps dist/tests/smoke.js
```

## Replay and Memory Validation

```bash
cd quant-god-engine
npm run test:replay-memory
```

## Python Quant Modules

- `models/bayesian/bayes_update.py`
- `models/logistic/logistic_model.py`
- `models/regime/regime_classifier.py`
- `models/calibration/calibration.py`

These modules provide portable quant primitives for external research pipelines and offline model validation.

## Authority Boundaries

- AI layer cannot execute, route, or override orders
- Risk layer is gatekeeper for all execution intents
- Execution layer obeys risk decisions and idempotency constraints

## Next Implementation Milestones

- True Kalshi adapter (REST + WS auth + order routing)
- Production storage adapters (Postgres/ClickHouse/Redis)
- Correlation-aware portfolio allocator
- Full Monte Carlo stress testing suite
- Replay determinism checksum verification
- Distributed worker orchestration and queueing
