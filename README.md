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
- **Candles**: CryptoCompare (15-min OHLCV, no key required)
- **Price / Order Book**: Coinbase Exchange (User-Agent header required)
- **AI Analysis**: Claude Sonnet 4 via Anthropic API

## Deploy
Static single-file HTML — deploys to Vercel as-is.
