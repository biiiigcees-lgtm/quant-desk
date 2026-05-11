-- ============================================================
-- Quant Desk — PostgreSQL Event Sourcing Schema
-- ============================================================
-- All tables are append-only (no updates, no deletes).
-- Partitioned by day where applicable for retention management.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Reality Layer ─────────────────────────────────────────

CREATE TABLE reality_snapshots (
  id                  BIGSERIAL PRIMARY KEY,
  contract_id         TEXT        NOT NULL,
  system_state        TEXT        NOT NULL CHECK (system_state IN ('nominal','cautious','degraded','halted')),
  actionable_state    BOOLEAN     NOT NULL,
  uncertainty_state   TEXT        NOT NULL CHECK (uncertainty_state IN ('low','medium','high','extreme')),
  execution_permission BOOLEAN    NOT NULL,
  canonical_snapshot_id TEXT      NOT NULL,
  truth_score         NUMERIC(6,4) NOT NULL,
  calibration_factor  NUMERIC(6,4) NOT NULL,
  drift_factor        NUMERIC(6,4) NOT NULL,
  anomaly_factor      NUMERIC(6,4) NOT NULL,
  belief_factor       NUMERIC(6,4) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reality_snapshots_contract ON reality_snapshots(contract_id, created_at DESC);
CREATE INDEX idx_reality_snapshots_state    ON reality_snapshots(system_state, created_at DESC);

-- ── Probability Events ────────────────────────────────────

CREATE TABLE probability_events (
  id                      BIGSERIAL PRIMARY KEY,
  contract_id             TEXT          NOT NULL,
  estimated_probability   NUMERIC(6,4)  NOT NULL,
  market_implied_prob     NUMERIC(6,4)  NOT NULL,
  edge                    NUMERIC(7,5)  NOT NULL,
  ci_low                  NUMERIC(6,4)  NOT NULL,
  ci_high                 NUMERIC(6,4)  NOT NULL,
  uncertainty_score       NUMERIC(6,4)  NOT NULL,
  calibration_error       NUMERIC(6,4)  NOT NULL,
  brier_score             NUMERIC(6,4)  NOT NULL,
  regime                  TEXT          NOT NULL,
  event_ts                BIGINT        NOT NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE probability_events_default PARTITION OF probability_events DEFAULT;
CREATE INDEX idx_prob_events_contract ON probability_events(contract_id, event_ts DESC);

-- ── Execution Plans ───────────────────────────────────────

CREATE TABLE execution_plans (
  id                  BIGSERIAL PRIMARY KEY,
  execution_id        TEXT          NOT NULL UNIQUE,
  contract_id         TEXT          NOT NULL,
  direction           TEXT          NOT NULL CHECK (direction IN ('YES','NO')),
  order_style         TEXT          NOT NULL CHECK (order_style IN ('market','passive','sliced')),
  slices              INT           NOT NULL,
  expected_slippage   NUMERIC(7,5)  NOT NULL,
  fill_probability    NUMERIC(6,4)  NOT NULL,
  limit_price         NUMERIC(10,4) NOT NULL,
  size                INT           NOT NULL,
  latency_budget_ms   INT           NOT NULL,
  route_reason        TEXT          NOT NULL,
  safety_mode         TEXT          NOT NULL CHECK (safety_mode IN ('normal','safe-mode','hard-stop')),
  event_ts            BIGINT        NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exec_plans_contract ON execution_plans(contract_id, event_ts DESC);

-- ── Order Events ──────────────────────────────────────────

CREATE TABLE order_events (
  id            BIGSERIAL PRIMARY KEY,
  order_id      TEXT        NOT NULL,
  execution_id  TEXT        NOT NULL REFERENCES execution_plans(execution_id),
  contract_id   TEXT        NOT NULL,
  direction     TEXT        NOT NULL,
  size          INT         NOT NULL,
  price         NUMERIC(10,4) NOT NULL,
  status        TEXT        NOT NULL CHECK (status IN ('pending','filled','partial','rejected','cancelled')),
  event_ts      BIGINT      NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_events_contract ON order_events(contract_id, event_ts DESC);
CREATE INDEX idx_order_events_exec     ON order_events(execution_id, event_ts DESC);

-- ── Validation Results ────────────────────────────────────

CREATE TABLE validation_results (
  id          BIGSERIAL PRIMARY KEY,
  contract_id TEXT          NOT NULL,
  strategy_id TEXT          NOT NULL,
  kind        TEXT          NOT NULL CHECK (kind IN ('walk-forward','adversarial')),
  status      TEXT          NOT NULL CHECK (status IN ('pass','fail','hold')),
  score       NUMERIC(7,2)  NOT NULL,
  details     TEXT          NOT NULL,
  event_ts    BIGINT        NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_validation_strategy ON validation_results(strategy_id, event_ts DESC);
CREATE INDEX idx_validation_contract ON validation_results(contract_id, event_ts DESC);

-- ── Strategy Lifecycle Events ─────────────────────────────

CREATE TABLE lifecycle_events (
  id              BIGSERIAL PRIMARY KEY,
  strategy_id     TEXT          NOT NULL,
  phase           TEXT          NOT NULL CHECK (phase IN ('birth','growth','maturity','decay','extinction')),
  previous_phase  TEXT          NOT NULL,
  fitness         NUMERIC(10,6) NOT NULL,
  audit_score     NUMERIC(6,2)  NOT NULL,
  reason          TEXT          NOT NULL,
  event_ts        BIGINT        NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lifecycle_strategy ON lifecycle_events(strategy_id, event_ts DESC);

-- ── Causal Edges ──────────────────────────────────────────

CREATE TABLE causal_edges (
  id                  BIGSERIAL PRIMARY KEY,
  cause_event         TEXT          NOT NULL,
  effect_event        TEXT          NOT NULL,
  causal_strength     NUMERIC(6,4)  NOT NULL,
  reverse_strength    NUMERIC(6,4)  NOT NULL,
  spurious            BOOLEAN       NOT NULL,
  opportunities       INT           NOT NULL DEFAULT 0,
  transitions         INT           NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (cause_event, effect_event)
);

-- ── Calibration History ───────────────────────────────────

CREATE TABLE calibration_history (
  id          BIGSERIAL PRIMARY KEY,
  contract_id TEXT          NOT NULL,
  ece         NUMERIC(6,4)  NOT NULL,
  brier       NUMERIC(6,4)  NOT NULL,
  calibrated_confidence NUMERIC(6,4) NOT NULL,
  event_ts    BIGINT        NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calibration_contract ON calibration_history(contract_id, event_ts DESC);

-- ── Drift Events ──────────────────────────────────────────

CREATE TABLE drift_events (
  id          BIGSERIAL PRIMARY KEY,
  contract_id TEXT          NOT NULL,
  psi         NUMERIC(8,5)  NOT NULL,
  kl          NUMERIC(8,5)  NOT NULL,
  severity    TEXT          NOT NULL CHECK (severity IN ('low','medium','high')),
  event_ts    BIGINT        NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drift_contract ON drift_events(contract_id, event_ts DESC);

-- ── Anomaly Events ────────────────────────────────────────

CREATE TABLE anomaly_events (
  id                      BIGSERIAL PRIMARY KEY,
  contract_id             TEXT          NOT NULL,
  anomaly_type            TEXT          NOT NULL,
  severity                TEXT          NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  confidence_degradation  NUMERIC(5,3)  NOT NULL,
  details                 TEXT          NOT NULL,
  event_ts                BIGINT        NOT NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_anomaly_contract  ON anomaly_events(contract_id, event_ts DESC);
CREATE INDEX idx_anomaly_severity  ON anomaly_events(severity, event_ts DESC);

-- ── Portfolio Snapshots ───────────────────────────────────

CREATE TABLE portfolio_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  capital         NUMERIC(16,2) NOT NULL,
  exposure        NUMERIC(16,2) NOT NULL,
  realized_pnl    NUMERIC(16,2) NOT NULL,
  unrealized_pnl  NUMERIC(16,2) NOT NULL,
  drawdown        NUMERIC(8,5)  NOT NULL,
  event_ts        BIGINT        NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── AI Agent Run Log ──────────────────────────────────────

CREATE TABLE ai_agent_runs (
  id              BIGSERIAL PRIMARY KEY,
  agent           TEXT          NOT NULL,
  contract_id     TEXT          NOT NULL,
  trigger_event   TEXT          NOT NULL,
  latency_ms      INT           NOT NULL,
  model           TEXT          NOT NULL,
  prompt_tokens   INT,
  completion_tokens INT,
  estimated_cost_usd NUMERIC(12,6),
  fallback_depth  INT           NOT NULL DEFAULT 0,
  cache_hit       BOOLEAN       NOT NULL DEFAULT FALSE,
  success         BOOLEAN       NOT NULL DEFAULT TRUE,
  error_msg       TEXT,
  event_ts        BIGINT        NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_runs_agent   ON ai_agent_runs(agent, event_ts DESC);
CREATE INDEX idx_agent_runs_success ON ai_agent_runs(success, event_ts DESC);
