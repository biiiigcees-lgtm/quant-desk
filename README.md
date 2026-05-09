# QUANT//DESK — BTC Institutional Intelligence Terminal

Live BTC prediction market terminal built for Kalshi 15-minute contracts.

## Features
- EMA 9 / EMA 21 with ribbon, Golden/Death Cross detection
- 10-signal Bayesian ensemble (RSI, MACD, VWAP, CVD, ATR, Stoch, Momentum, OB/OS, Bollinger, EMA)
- Bet Signal Engine — fires only on high-conviction setups (7+/10 alignment + trajectory confluence)
- Trajectory slope analysis (linear regression across EMA9, EMA21, price)
- Fair Value Gap detection + chart overlay
- Liquidity sweep detection (BSL/SSL)
- Kalshi divergence + Kelly criterion sizing
- Live order book and price stream (Coinbase Exchange)
- Shared backend system truth gate for risk, execution, and UI lock state
- Snapshot-aware AI analysis with stale-request rejection and retry
- Closed-loop performance tracking for the last 50 resolved calls

## Data Sources
- **OHLCV Candles**: CryptoCompare 15-minute BTC/USD history
- **Live Price + Order Book + Trades**: Coinbase Exchange public API / websocket
- **Oracle Reference**: Coinbase spot plus CryptoCompare reference candles
- **Derivatives**: Bybit primary with OKX fallback
- **AI Analysis**: OpenRouter chat completions via serverless function

## Architecture
- **Frontend**: Static `index.html` with no build step
- **Backend**: Vercel Serverless functions in `api/*`
- **Truth Layer**: `GET/POST /api/system-truth`
- **Execution Gate**: `/api/analyze` enforces risk lock and snapshot freshness before any AI call
- **Feedback Loop**: `/api/record-result` and `/api/performance`
- **AI**: OpenRouter key stored in `OPENROUTER_API_KEY`, never exposed to the browser

## Core Endpoints
- `GET/POST /api/system-truth` — canonical execution state shared across subsystems
- `POST /api/analyze` — gated AI analysis request; blocks on high risk or stale snapshots
- `GET /api/ohlcv` — normalized CryptoCompare 15-minute candles
- `GET /api/oracle` — Coinbase/CryptoCompare feed-health composite
- `GET /api/derivatives` — Bybit with OKX fallback
- `POST /api/record-result` — record one resolved prediction outcome
- `GET /api/performance` — rolling performance stats for last 10 / last 50 outcomes

## Environment Variables (Vercel Dashboard)
| Variable | Value |
|----------|-------|
| `OPENROUTER_API_KEY` | Your key from https://openrouter.ai/keys |

## Deploy
Static HTML plus serverless functions — deploys to Vercel as-is, with no build step and no browser storage requirements.
