# QUANT//DEK — Autonomous Adaptive Market Intelligence System

Real-time distributed intelligence system for BTC 15-minute Kalshi-style contracts. Not a trading bot — an intelligence research desk.

## Architecture

**Monorepo Structure:**
```
quant-desk/
├── apps/
│   ├── ui/          # Next.js 15 Control Tower
│   └── api/         # Vercel serverless API
├── core/            # Analysis pipeline (regime, features, decision, risk, shadow)
├── services/        # WebSocket feed, Kalshi sync, market aggregator
├── workers/         # Strategy evolution, calibration, adversarial, backtest
└── infra/           # Redis, logger, rate limiting
```

**Core Pipeline:**
```
Market Stream → Snapshot → Regime → Features → Strategy → Ensemble → EV → Risk → Shadow → Decision → Calibration
```

## Features

- **Regime Detection**: TRENDING_UP, TRENDING_DOWN, CHOPPY, RANGE, VOLATILE, PANIC
- **Feature Engine**: Base (EMA, RSI, MACD, VWAP, volatility, orderbook) + Synthetic (entropy, momentum ratio, acceleration, liquidity stress)
- **Strategy Genome System**: Neural network-based strategies with mutation, recombination, fitness scoring
- **Expected Value Engine**: EV = (probability * payout) - ((1 - probability) * loss)
- **Risk Engine**: Confidence threshold, data health, volatility/liquidity checks, drawdown limits, kill switch
- **Shadow Mode Engine**: Counterfactual simulation (actual, inverse, no-trade, best alternative)
- **Adversarial System**: Stress testing (volatility spikes, liquidity collapse, noise, regime flips)
- **Calibration Worker**: Probability bias tracking and adjustment

## Data Sources

- **Coinbase WebSocket**: Real-time BTC price, orderbook, trades
- **Kalshi API**: 15-minute contract sync
- **Multi-source Oracle**: Binance.us, Kraken, Bybit, CoinGecko

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
# Redis (Upstash)
REDIS_URL=redis://localhost:6379
REDIS_REST_URL=
REDIS_REST_TOKEN=

# Kalshi
KALSHI_API_KEY=e7d488f2-dde6-4539-855f-0c27303ddb60

# OpenRouter (AI)
OPENROUTER_API_KEY=
```

## Local Development

```bash
# Install dependencies
npm install

# Run UI dev server
npm run dev

# Run workers (separate terminals)
npm run worker:evolver
npm run worker:calibration
npm run worker:adversarial
npm run worker:backtest
```

## API Endpoints

- `POST /api/analyze` - Main decision endpoint
- `GET /api/snapshot` - Current market state
- `GET /api/performance` - System metrics
- `POST /api/strategy/evolve` - Trigger evolution
- `POST /api/shadow/run` - Shadow simulation
- `GET /api/regime` - Current regime
- `GET /api/oracle` - Multi-source price oracle
- `GET /api/derivatives` - Bybit derivatives data

## Deployment

Deploy to Vercel:

```bash
vercel
```

Configure environment variables in Vercel dashboard:
- `REDIS_URL` (Upstash)
- `REDIS_REST_URL` (Upstash)
- `REDIS_REST_TOKEN` (Upstash)
- `KALSHI_API_KEY`
- `OPENROUTER_API_KEY` (optional)

## Testing

```bash
npm test
```

Tests include:
- Unit tests for feature engine, EV engine, risk engine
- Integration tests for full pipeline
- Adversarial stress tests
