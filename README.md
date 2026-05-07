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
- Live order book (Coinbase Exchange)
- Claude Sonnet AI analyst (expert trajectory + ABOVE/BELOW verdict)

## Data Sources
- **Candles + Price + Order Book**: Coinbase Exchange (full CORS, no key required)
- **AI Analysis**: OpenRouter → meta-llama/llama-3.3-70b-instruct:free (free tier)

## Architecture
- **Frontend**: Vercel Static (single HTML file)
- **Backend**: Vercel Serverless (`/api/analyze.js`)
- **AI**: OpenRouter free tier — key stored in `OPENROUTER_API_KEY` env var, never in browser

## Environment Variables (Vercel Dashboard)
| Variable | Value |
|----------|-------|
| `OPENROUTER_API_KEY` | Your key from https://openrouter.ai/keys |

## Deploy
Static single-file HTML — deploys to Vercel as-is.
