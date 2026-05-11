# Quant System (Phases 1-14)

Event-driven TypeScript trading foundation for Kalshi 15-minute markets.

## Included

- Core event bus, typed models, config, logger, error types
- Market data ingestion and normalization
- Feature engine (EMA, RSI, MACD, velocity, volatility regime)
- Four deterministic strategies
- Weighted signal aggregation service
- Risk, execution, and position/portfolio engines
- AI analyst narrative service
- Backtesting toolkit
- Storage abstraction adapters
- REST API + SSE event stream
- CLI entrypoints for live, backtest, replay
- Runnable bootstrap (`main.ts` + shared app system)

## Quick Start

```bash
cd quant-system
npm install
cp .env.example .env
npm run check
npm run build
npm start
npm run start:live
npm run backtest -- KXBTC-DEMO
npm run dev:replay
```

## API

- `GET /health`
- `GET /portfolio`
- `GET /orders`
- `GET /positions`
- `GET /signal`
- `GET /stream` (SSE)
